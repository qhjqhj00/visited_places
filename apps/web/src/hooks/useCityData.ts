import { useEffect, useState } from 'react';
import MiniSearch from 'minisearch';
import type { City } from '../types';

export interface CityData {
  all: City[];
  byId: Map<number, City>;
  neighbors: Record<string, number[]>;
  mini: MiniSearch;
}

export function useCityData() {
  const [data, setData] = useState<CityData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cities, neighbors] = await Promise.all([
          fetch('/data/cities.json').then((r) => r.json()),
          fetch('/data/neighbors.json').then((r) => r.json()),
        ]);
        const all = cities as City[];
        const byId = new Map<number, City>(all.map((c) => [c.id, c]));
        const mini = new MiniSearch({
          idField: 'id',
          fields: ['en', 'zh'],
          storeFields: ['en', 'zh'],
        });
        mini.addAll(all.map((c) => ({ id: c.id, en: c.en, zh: c.zh ?? '' })));
        if (!cancelled) {
          setData({ all, byId, neighbors: neighbors as Record<string, number[]>, mini });
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, error };
}
