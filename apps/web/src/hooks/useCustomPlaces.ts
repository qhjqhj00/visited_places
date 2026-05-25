import { useCallback, useEffect, useRef, useState } from 'react';
import type { City } from '../types';
import { api, getUserId } from '../lib/api';

// Per-user cache key (see useVisited) with one-time adoption of the old global key.
const uid = getUserId();
const KEY = `customPlaces.v1:${uid}`;
const LEGACY_KEY = 'customPlaces.v1';

function initialPlaces(): City[] {
  try {
    let raw = localStorage.getItem(KEY);
    if (raw === null && uid === '0') {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy !== null) {
        localStorage.setItem(KEY, legacy);
        localStorage.removeItem(LEGACY_KEY);
        raw = legacy;
      }
    }
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? (parsed as City[]) : [];
  } catch {
    return [];
  }
}

function mergeById(a: City[], b: City[]): City[] {
  const have = new Set(a.map((p) => p.id));
  const extra = b.filter((p) => !have.has(p.id));
  return extra.length ? [...a, ...extra] : a;
}

/**
 * Ad-hoc places picked straight off the basemap (small towns below the GeoNames
 * cutoff, e.g. Swansea/Strahan TAS). Stored as full City objects so their
 * negative ids resolve on reload. localStorage is the instant cache; the objects
 * are also synced to the server (under the current userid) so the negative ids
 * in a saved map resolve on any browser, not just the one that created them.
 */
export function useCustomPlaces() {
  const [places, setPlaces] = useState<City[]>(initialPlaces);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(places));
  }, [places]);

  // pull server places once, merge into the local set
  useEffect(() => {
    api
      .loadPlaces()
      .then((srv) => srv.length && setPlaces((prev) => mergeById(prev, srv)))
      .catch(() => {})
      .finally(() => setSynced(true));
  }, []);

  // after the initial pull, push the merged set up (and on every later change)
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!synced) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => api.savePlaces(places).catch(() => {}), 700);
  }, [places, synced]);

  const addPlace = useCallback(
    (c: City) => setPlaces((prev) => (prev.some((p) => p.id === c.id) ? prev : [...prev, c])),
    []
  );

  return { places, addPlace };
}

/** Stable negative id for an ad-hoc place (kept clear of destination ids -1..-99). */
export function customPlaceId(name: string, lng: number, lat: number): number {
  const s = `${name}|${lng.toFixed(3)}|${lat.toFixed(3)}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return -(100000 + ((h >>> 0) % 900000000));
}
