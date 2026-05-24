import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface City {
  id: number;
  en: string;
  zh: string | null;
  country: string;
  cc: string;
  ccn: string;
  cont: string;
  lat: number;
  lng: number;
  pop: number;
  prom: number;
  fcode: string;
  adm1: string;
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(
  fs.readFileSync(path.resolve(dir, '../../web/public/data/cities.json'), 'utf8')
) as City[];

export const byId = new Map<number, City>(raw.map((c) => [c.id, c]));

const enIndex = new Map<string, City[]>();
const zhIndex = new Map<string, City[]>();

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

function add(map: Map<string, City[]>, key: string, c: City) {
  const a = map.get(key);
  if (a) a.push(c);
  else map.set(key, [c]);
}

for (const c of raw) {
  const e = norm(c.en);
  if (e) add(enIndex, e, c);
  if (c.zh) add(zhIndex, c.zh.trim(), c);
}

function best(cands: City[], country?: string): City | null {
  if (!cands.length) return null;
  let pool = cands;
  if (country) {
    const cl = country.toLowerCase();
    const f = cands.filter((c) => c.country.toLowerCase() === cl || c.cc.toLowerCase() === cl);
    if (f.length) pool = f;
  }
  return pool.reduce((a, b) => (b.prom > a.prom ? b : a));
}

/** Resolve an LLM-suggested name to a real city in our dataset (or null). */
export function resolveCity(
  name_en?: string,
  name_zh?: string,
  country?: string
): City | null {
  if (name_en) {
    const r = best(enIndex.get(norm(name_en)) ?? [], country);
    if (r) return r;
  }
  if (name_zh) {
    const r = best(zhIndex.get(name_zh.trim()) ?? [], country);
    if (r) return r;
  }
  return null;
}
