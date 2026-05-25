import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

/** A flown route: an unordered city-id pair + how many times flown. */
export interface FlightRoute {
  a: number;
  b: number;
  n: number;
}

const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const same = (r: FlightRoute, a: number, b: number) =>
  (r.a === a && r.b === b) || (r.a === b && r.b === a);

/** Editable per-user flown routes (server-backed, seeded for uid 0 from the
 * bundled flight.xls import). Provides add / delete / edit-count + autosave. */
export function useFlights() {
  const [routes, setRoutes] = useState<FlightRoute[]>([]);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    api
      .loadFlights()
      .then((srv) => setRoutes(Array.isArray(srv) ? srv : []))
      .catch(() => {})
      .finally(() => setSynced(true));
  }, []);

  // debounced autosave once the initial load has happened
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!synced) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => api.saveFlights(routes).catch(() => {}), 600);
  }, [routes, synced]);

  // add a route (merges into an existing pair by summing the count)
  const addRoute = useCallback((a: number, b: number, n = 1) => {
    if (a === b) return;
    setRoutes((prev) => {
      const i = prev.findIndex((r) => same(r, a, b));
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], n: next[i].n + n };
        return next;
      }
      return [...prev, { a, b, n }];
    });
  }, []);

  const removeRoute = useCallback((a: number, b: number) => {
    setRoutes((prev) => prev.filter((r) => !same(r, a, b)));
  }, []);

  const setRouteCount = useCallback((a: number, b: number, n: number) => {
    setRoutes((prev) =>
      prev.map((r) => (same(r, a, b) ? { ...r, n: Math.max(1, Math.floor(n) || 1) } : r))
    );
  }, []);

  // Import: upsert by route key — sets each incoming route's count (overwrites an
  // existing pair, adds new ones), keeping manual routes. Re-importing the same
  // file is idempotent rather than doubling the counts.
  const upsertRoutes = useCallback((incoming: FlightRoute[]) => {
    setRoutes((prev) => {
      const m = new Map(prev.map((r) => [key(r.a, r.b), r]));
      for (const r of incoming) {
        if (r.a === r.b) continue;
        m.set(key(r.a, r.b), { a: r.a, b: r.b, n: Math.max(1, Math.floor(r.n) || 1) });
      }
      return [...m.values()];
    });
  }, []);

  return { routes, addRoute, removeRoute, setRouteCount, upsertRoutes, routeKey: key };
}
