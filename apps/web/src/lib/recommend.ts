import type { CityData } from '../hooks/useCityData';
import type { City } from '../types';

/**
 * "Snowball" recommendations. The most recently added cities dominate, so right
 * after you add Sapporo its neighbors (Otaru, Chitose…) surface as chips; adding
 * one shifts the pool toward *its* neighbors, and so on.
 */
export function recommend(selectedOrder: number[], data: CityData, limit = 12): City[] {
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
