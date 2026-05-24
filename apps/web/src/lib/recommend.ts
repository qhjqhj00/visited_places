import type { CityData } from '../hooks/useCityData';
import type { City } from '../types';

/**
 * "Snowball" recommendations. The most recently added cities dominate, so right
 * after you add Sapporo its neighbors (Otaru, Chitose…) surface as chips; adding
 * one shifts the pool toward *its* neighbors, and so on.
 */
export function recommend(selectedOrder: number[], data: CityData, limit = 18): City[] {
  const selected = new Set(selectedOrder);
  const scores = new Map<number, number>();
  const recent = selectedOrder.slice(-6); // newest few drive the chips

  recent.forEach((id, idx) => {
    const rank = recent.length - 1 - idx; // 0 = most recent
    const recencyW = Math.exp(-rank / 2);
    const list = data.neighbors[String(id)] || [];
    list.forEach((nid, order) => {
      if (selected.has(nid)) return;
      const c = data.byId.get(nid);
      if (!c) return;
      const orderW = 1 / (1 + order * 0.15);
      const promW = 0.5 + c.prom / 10;
      scores.set(nid, (scores.get(nid) || 0) + recencyW * orderW * promW);
    });
  });

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => data.byId.get(id)!)
    .filter(Boolean);
}

// Small deterministic PRNG (mulberry32) so a given seed reproduces a shuffle.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * Country-focused chips (shown after you drill into a country). Rather than only
 * cities near what you've already picked, this surfaces a weighted-random spread
 * of the country's big/famous cities so you discover the whole country. Prominent
 * cities are likelier (Efraimidis–Spirakis weighted sampling) but not guaranteed,
 * so each `seed` (bumped when you open a country / hit "换一批") gives a fresh set.
 */
export function recommendInCountry(
  data: CityData,
  cc: string,
  limit = 30,
  seed = 0,
  exclude?: Set<number>
): City[] {
  const inCc = data.all.filter((c) => c.cc === cc);
  // restrict to a "famous pool" so only notable cities can appear, then shuffle
  const famous = [...inCc].sort((a, b) => b.prom - a.prom).slice(0, Math.max(limit * 2, 60));

  const rand = rng((seed * 2654435761) ^ hashStr(cc));
  const shuffled = famous
    .map((c) => ({ c, key: Math.pow(rand(), 1 / Math.pow(Math.max(c.prom, 0.5), 1.5)) }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.c);

  return shuffled.filter((c) => !exclude?.has(c.id)).slice(0, limit);
}

/** Seed chips before anything is selected: most prominent city per country. */
export function starters(data: CityData, limit = 12): City[] {
  const seen = new Set<string>();
  const out: City[] = [];
  for (const c of [...data.all].sort((a, b) => b.prom - a.prom)) {
    if (seen.has(c.country)) continue;
    seen.add(c.country);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}
