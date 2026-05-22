import type { City } from '../types';

export interface Stats {
  cities: number;
  countries: number;
  continents: number;
  worldPct: number; // share of the ~195 sovereign countries
}

const WORLD_COUNTRIES = 195;

export function computeStats(selected: City[]): Stats {
  const countries = new Set<string>();
  const continents = new Set<string>();
  for (const c of selected) {
    if (c.country) countries.add(c.country);
    if (c.cont) continents.add(c.cont);
  }
  return {
    cities: selected.length,
    countries: countries.size,
    continents: continents.size,
    worldPct: Math.round((countries.size / WORLD_COUNTRIES) * 1000) / 10,
  };
}
