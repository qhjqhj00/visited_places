// Great-circle arc geometry for the flight map. Routes are drawn as curved
// lines (slerp between endpoints on the unit sphere), like the 航旅纵横 reference.

export interface Route {
  a: number; // from city id
  b: number; // to city id
  n: number; // times flown
  from: [number, number]; // [lng, lat]
  to: [number, number];
}

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

function toVec([lng, lat]: [number, number]): [number, number, number] {
  const la = lat * D2R, lo = lng * D2R;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

/** Points along the great circle from `from` to `to`. Longitudes are unwrapped
 * (kept continuous past ±180) so antimeridian-crossing arcs render correctly. */
export function greatCircle(
  from: [number, number],
  to: [number, number],
  steps = 64
): [number, number][] {
  const u = toVec(from);
  const v = toVec(to);
  let dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  dot = Math.max(-1, Math.min(1, dot));
  const omega = Math.acos(dot);
  const pts: [number, number][] = [];
  if (omega < 1e-6) return [from, to];
  const sin = Math.sin(omega);
  let prevLng: number | null = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const k1 = Math.sin((1 - t) * omega) / sin;
    const k2 = Math.sin(t * omega) / sin;
    const x = k1 * u[0] + k2 * v[0];
    const y = k1 * u[1] + k2 * v[1];
    const z = k1 * u[2] + k2 * v[2];
    const lat = Math.atan2(z, Math.hypot(x, y)) * R2D;
    let lng = Math.atan2(y, x) * R2D;
    if (prevLng !== null) {
      while (lng - prevLng > 180) lng -= 360;
      while (lng - prevLng < -180) lng += 360;
    }
    prevLng = lng;
    pts.push([lng, lat]);
  }
  return pts;
}

/** FeatureCollection of great-circle LineStrings (one per route, weighted by n). */
export function arcsFC(routes: Route[]): any {
  return {
    type: 'FeatureCollection',
    features: routes.map((r) => ({
      type: 'Feature',
      properties: { n: r.n },
      geometry: { type: 'LineString', coordinates: greatCircle(r.from, r.to) },
    })),
  };
}

/** FeatureCollection of unique route endpoints (small dots for routes-only view). */
export function nodesFC(routes: Route[]): any {
  const seen = new Map<string, [number, number]>();
  for (const r of routes) {
    seen.set(r.from.join(','), r.from);
    seen.set(r.to.join(','), r.to);
  }
  return {
    type: 'FeatureCollection',
    features: [...seen.values()].map((p) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: p },
    })),
  };
}
