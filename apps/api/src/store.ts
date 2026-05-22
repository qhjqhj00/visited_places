import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Tiny JSON-file store. Adequate for v1 volume (maps/shares/expand cache) and
// dependency-free. Swap for Postgres/SQLite when traffic warrants — the call
// sites only touch this `store` interface.
interface DB {
  maps: Record<string, number[]>; // user_id -> city ids
  shares: Record<string, number[]>; // code -> city ids
  cache: Record<string, number[]>; // anchor_id -> resolved city ids
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(dir, '../data.json');

let data: DB = { maps: {}, shares: {}, cache: {} };
try {
  data = { maps: {}, shares: {}, cache: {}, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
} catch {
  /* fresh store */
}

let timer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    fs.writeFile(FILE, JSON.stringify(data), () => {});
  }, 50);
}

export const store = {
  getMap: (uid: string): number[] => data.maps[uid] ?? [],
  setMap: (uid: string, ids: number[]) => {
    data.maps[uid] = ids;
    persist();
  },
  getShare: (code: string): number[] | undefined => data.shares[code],
  addShare: (code: string, ids: number[]) => {
    data.shares[code] = ids;
    persist();
  },
  getCache: (anchorId: number): number[] | undefined => data.cache[String(anchorId)],
  setCache: (anchorId: number, ids: number[]) => {
    data.cache[String(anchorId)] = ids;
    persist();
  },
};
