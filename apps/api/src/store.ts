import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

// SQLite persistence via sql.js (WASM — no native build, unlike better-sqlite3
// which needs node-gyp). The whole DB lives in memory and is flushed to a real
// `data.sqlite` file (standard SQLite format) on each write. Id lists are stored
// as JSON text per row, mirroring the previous store's array-in/array-out shape;
// normalise into city rows later if querying across maps is ever needed.
const dir = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = process.env.DB_FILE || path.resolve(dir, '../data.sqlite'); // override for Docker volumes
const JSON_FILE = path.resolve(dir, '../data.json'); // legacy store, migrated once
const FLIGHTS_JSON = path.resolve(dir, '../../web/public/data/flights.json'); // seed for uid 0
const require = createRequire(import.meta.url);

type DB = {
  run: (sql: string, params?: unknown[]) => void;
  exec: (sql: string, params?: unknown[]) => Array<{ values: unknown[][] }>;
  export: () => Uint8Array;
};
let db: DB;

let timer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try {
      fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
    } catch {
      /* best effort */
    }
  }, 50);
}

const list = (rows: Array<{ values: unknown[][] }>): number[] | undefined =>
  rows.length ? (JSON.parse(rows[0].values[0][0] as string) as number[]) : undefined;

export async function initStore(): Promise<void> {
  const SQL = await initSqlJs({
    locateFile: (f: string) => path.join(path.dirname(require.resolve('sql.js')), f),
  });
  db = fs.existsSync(DB_FILE) ? new SQL.Database(fs.readFileSync(DB_FILE)) : new SQL.Database();
  db.run(
    `CREATE TABLE IF NOT EXISTS maps   (uid TEXT PRIMARY KEY, ids TEXT NOT NULL);
     CREATE TABLE IF NOT EXISTS shares (code TEXT PRIMARY KEY, ids TEXT NOT NULL);
     CREATE TABLE IF NOT EXISTS cache  (anchor INTEGER PRIMARY KEY, ids TEXT NOT NULL);
     CREATE TABLE IF NOT EXISTS places (uid TEXT PRIMARY KEY, json TEXT NOT NULL);
     CREATE TABLE IF NOT EXISTS flights(uid TEXT PRIMARY KEY, json TEXT NOT NULL);`
  );
  const empty = !db.exec('SELECT 1 FROM maps LIMIT 1').length;
  if (empty && fs.existsSync(JSON_FILE)) migrateFromJson();
  // seed uid "0" flights from the bundled dataset (tommy's flown routes) once
  if (!db.exec("SELECT 1 FROM flights WHERE uid='0'").length && fs.existsSync(FLIGHTS_JSON)) {
    try {
      const fj = JSON.parse(fs.readFileSync(FLIGHTS_JSON, 'utf8'));
      const routes = (fj.routes ?? []).map((r: any) => ({ a: r.a, b: r.b, n: r.n }));
      store.setFlights('0', routes);
      console.log(`seeded userid "0" flights with ${routes.length} routes`);
    } catch {
      /* best effort */
    }
  }
  persist();
}

/** One-time import of the legacy JSON store. Seeds userid "0" (the single bucket
 * used until login) with the largest existing map = the current working data. */
function migrateFromJson() {
  let j: { maps?: Record<string, number[]>; shares?: Record<string, number[]>; cache?: Record<string, number[]> };
  try {
    j = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
  } catch {
    return;
  }
  let current: number[] = [];
  for (const ids of Object.values(j.maps ?? {})) if (ids.length > current.length) current = ids;
  store.setMap('0', current);
  for (const [code, ids] of Object.entries(j.shares ?? {})) store.addShare(code, ids);
  for (const [anchor, ids] of Object.entries(j.cache ?? {})) store.setCache(Number(anchor), ids);
  console.log(`migrated legacy store → userid "0" seeded with ${current.length} cities`);
}

export const store = {
  getMap: (uid: string): number[] =>
    list(db.exec('SELECT ids FROM maps WHERE uid=?', [uid])) ?? [],
  setMap: (uid: string, ids: number[]) => {
    db.run('INSERT OR REPLACE INTO maps (uid, ids) VALUES (?, ?)', [uid, JSON.stringify(ids)]);
    persist();
  },
  getShare: (code: string): number[] | undefined =>
    list(db.exec('SELECT ids FROM shares WHERE code=?', [code])),
  addShare: (code: string, ids: number[]) => {
    db.run('INSERT OR REPLACE INTO shares (code, ids) VALUES (?, ?)', [code, JSON.stringify(ids)]);
    persist();
  },
  getCache: (anchorId: number): number[] | undefined =>
    list(db.exec('SELECT ids FROM cache WHERE anchor=?', [anchorId])),
  setCache: (anchorId: number, ids: number[]) => {
    db.run('INSERT OR REPLACE INTO cache (anchor, ids) VALUES (?, ?)', [anchorId, JSON.stringify(ids)]);
    persist();
  },
  // ad-hoc places picked off the basemap (full objects), so they resolve anywhere
  getPlaces: (uid: string): unknown[] => {
    const r = db.exec('SELECT json FROM places WHERE uid=?', [uid]);
    return r.length ? (JSON.parse(r[0].values[0][0] as string) as unknown[]) : [];
  },
  setPlaces: (uid: string, places: unknown[]) => {
    db.run('INSERT OR REPLACE INTO places (uid, json) VALUES (?, ?)', [uid, JSON.stringify(places)]);
    persist();
  },
  // flown routes [{a,b,n}] (city-id pairs + times flown); editable per user
  getFlights: (uid: string): unknown[] => {
    const r = db.exec('SELECT json FROM flights WHERE uid=?', [uid]);
    return r.length ? (JSON.parse(r[0].values[0][0] as string) as unknown[]) : [];
  },
  setFlights: (uid: string, routes: unknown[]) => {
    db.run('INSERT OR REPLACE INTO flights (uid, json) VALUES (?, ?)', [uid, JSON.stringify(routes)]);
    persist();
  },
  // Known users = whoever has a map row. Powers the user picker so a name created
  // on one browser is discoverable on another (username-only, no auth).
  listUsers: (): { uid: string; count: number }[] => {
    const r = db.exec('SELECT uid, ids FROM maps');
    if (!r.length) return [];
    return r[0].values.map((row) => {
      let count = 0;
      try {
        count = (JSON.parse(row[1] as string) as unknown[]).length;
      } catch {
        /* leave 0 */
      }
      return { uid: row[0] as string, count };
    });
  },
  // Move a user's map + custom places to a new name (claim the default bucket).
  renameUser: (from: string, to: string) => {
    if (from === to) return;
    const m = db.exec('SELECT ids FROM maps WHERE uid=?', [from]);
    if (m.length) {
      db.run('INSERT OR REPLACE INTO maps (uid, ids) VALUES (?, ?)', [to, m[0].values[0][0]]);
      db.run('DELETE FROM maps WHERE uid=?', [from]);
    }
    const p = db.exec('SELECT json FROM places WHERE uid=?', [from]);
    if (p.length) {
      db.run('INSERT OR REPLACE INTO places (uid, json) VALUES (?, ?)', [to, p[0].values[0][0]]);
      db.run('DELETE FROM places WHERE uid=?', [from]);
    }
    persist();
  },
};
