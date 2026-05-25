import { feature } from 'topojson-client';
import type { City } from '../types';

type Pt = [number, number];
type BBox = [number, number, number, number];
interface Poly {
  id: string;
  geometry: any;
  bbox: BBox;
}

// provinces: admin1 polygons (big countries only). countriesById: world 50m keyed
// by ISO-numeric id (matches each city's ccn — exact, no coastline PIP misses).
let provinces: Poly[] = [];
let countriesById = new Map<string, Poly>();
let ready: Promise<void> | null = null;

function bboxOf(geom: any): BBox {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  const scan = (co: any) => {
    if (typeof co[0] === 'number') {
      if (co[0] < a) a = co[0];
      if (co[0] > c) c = co[0];
      if (co[1] < b) b = co[1];
      if (co[1] > d) d = co[1];
    } else for (const x of co) scan(x);
  };
  scan(geom.coordinates);
  return [a, b, c, d];
}

// Make a ring's longitudes continuous (no ±180 jump). Antimeridian-spanning
// countries (Russia, Fiji) otherwise have a ring with points at both +179 and
// -179, which MapLibre fills as a band straight across the whole map. Walking the
// ring and keeping each step within 180° of the previous unwraps it (e.g. -170
// becomes 190) so the fill renders correctly. No-op for normal countries.
function unwrapRing(ring: number[][]): number[][] {
  let prev: number | null = null;
  return ring.map(([lng, lat]) => {
    let L = lng;
    if (prev !== null) {
      while (L - prev > 180) L -= 360;
      while (L - prev < -180) L += 360;
    }
    prev = L;
    return [L, lat];
  });
}

const inBox = (p: Pt, bb: BBox) => p[0] >= bb[0] && p[0] <= bb[2] && p[1] >= bb[1] && p[1] <= bb[3];

function inRing(p: Pt, ring: number[][]): boolean {
  let inside = false;
  const [x, y] = p;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPoly(p: Pt, rings: number[][][]): boolean {
  if (!inRing(p, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) if (inRing(p, rings[k])) return false; // hole
  return true;
}
function inGeom(p: Pt, g: any): boolean {
  if (g.type === 'Polygon') return inPoly(p, g.coordinates);
  if (g.type === 'MultiPolygon') return g.coordinates.some((q: any) => inPoly(p, q));
  return false;
}
function findPoly(list: Poly[], p: Pt): Poly | null {
  for (const f of list) if (inBox(p, f.bbox) && inGeom(p, f.geometry)) return f;
  return null;
}

export function loadRegions(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    const [a1, c50] = await Promise.all([
      fetch('/data/admin1.json').then((r) => r.json()),
      fetch('/data/countries-50m.json').then((r) => r.json()),
    ]);
    provinces = a1.features.map((f: any, i: number) => ({
      id: 'p' + i,
      geometry: f.geometry,
      bbox: bboxOf(f.geometry),
    }));
    const cfc: any = feature(c50, c50.objects.countries);
    // A country can appear as several features sharing one ISO id (e.g. AU =
    // mainland + a separate Ashmore Island ring). Merge them into one MultiPolygon
    // so the whole country fills / hit-tests — a plain Map would keep only the last,
    // which is how Australia was collapsing to a single tiny island.
    const byId = new Map<string, any[]>();
    for (const f of cfc.features) {
      if (f.id == null) continue;
      const id = String(f.id);
      const a = byId.get(id);
      if (a) a.push(f.geometry);
      else byId.set(id, [f.geometry]);
    }
    countriesById = new Map();
    for (const [id, geoms] of byId) {
      const coords: any[] = [];
      for (const g of geoms) {
        if (g.type === 'Polygon') coords.push(g.coordinates.map(unwrapRing));
        else if (g.type === 'MultiPolygon')
          coords.push(...g.coordinates.map((poly: any) => poly.map(unwrapRing)));
      }
      const geometry = { type: 'MultiPolygon', coordinates: coords };
      countriesById.set(id, { id, geometry, bbox: bboxOf(geometry) });
    }
  })();
  return ready;
}

export function dotR(prom: number): number {
  // base radius by prominence; kept small so dense regions don't blob together
  // (the marker layers scale this up with zoom — see mapStyle.addLayers).
  return Math.max(3, Math.min(6.5, 3 + (prom - 3) * 0.7));
}

const fc = (features: any[]) => ({ type: 'FeatureCollection', features });
const marker = (c: City) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
  properties: { id: c.id, cc: c.cc, label: c.en, zh: c.zh || '', r: dotR(c.prom) },
});

/** Point FeatureCollection of the given cities (each individually, with its id). */
export function markersFC(cities: City[]): any {
  return fc(cities.map(marker));
}

/** Candidate dots: dataset cities offered for on-map selection (hollow style). */
export function candidatesFC(cities: City[]): any {
  return fc(
    cities.map((c) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
      properties: { id: c.id, label: c.en, zh: c.zh || '' },
    }))
  );
}

export interface ViewData {
  regionFC: any;
  markerFC: any;
}

// Drop the far-flung pieces of a country's polygon that hold none of your visited
// cities — world-atlas lumps France's overseas departments (French Guiana, Réunion,
// Guadeloupe…) into the France polygon, so they'd otherwise fill alongside the
// mainland. Keeps any sub-polygon within ~20° of a visited city in that country.
function clipToVisited(geom: any, cities: City[]): any {
  if (geom.type !== 'MultiPolygon' || cities.length === 0) return geom;
  const DEG = 20;
  const near = (bb: BBox) =>
    cities.some((c) => {
      const dx = c.lng < bb[0] ? bb[0] - c.lng : c.lng > bb[2] ? c.lng - bb[2] : 0;
      const dy = c.lat < bb[1] ? bb[1] - c.lat : c.lat > bb[3] ? c.lat - bb[3] : 0;
      return Math.hypot(dx, dy) <= DEG;
    });
  const kept = geom.coordinates.filter((poly: any) =>
    near(bboxOf({ type: 'Polygon', coordinates: poly }))
  );
  return kept.length ? { type: 'MultiPolygon', coordinates: kept } : geom;
}

/** Global: countries filled, one dot per visited province (cc+adm1 group). */
export function buildGlobal(cities: City[]): ViewData {
  const repByCc = new Map<string, City>();
  const byCc = new Map<string, City[]>();
  for (const c of cities) {
    const r = repByCc.get(c.cc);
    if (!r || c.prom > r.prom) repByCc.set(c.cc, c);
    const a = byCc.get(c.cc);
    if (a) a.push(c);
    else byCc.set(c.cc, [c]);
  }
  const seen = new Set<string>();
  const regionFeatures: any[] = [];
  for (const [cc, rep] of repByCc) {
    const poly = countriesById.get(rep.ccn);
    if (poly && !seen.has(poly.id)) {
      seen.add(poly.id);
      const geometry = clipToVisited(poly.geometry, byCc.get(cc) ?? []);
      regionFeatures.push({ type: 'Feature', geometry, properties: { cc } });
    }
  }
  const groups = new Map<string, City>();
  for (const c of cities) {
    const k = c.cc + '/' + c.adm1;
    const r = groups.get(k);
    if (!r || c.prom > r.prom) groups.set(k, c);
  }
  return { regionFC: fc(regionFeatures), markerFC: fc([...groups.values()].map(marker)) };
}

/** Invisible hit-test layer: every country we can map to a 2-letter code, so a
 * click anywhere (even an unvisited country) resolves to a `cc` to drill into. */
export function allCountriesFC(ccnToCc: Map<string, string>): any {
  const features: any[] = [];
  for (const [ccn, poly] of countriesById) {
    const cc = ccnToCc.get(ccn);
    if (cc) features.push({ type: 'Feature', geometry: poly.geometry, properties: { cc } });
  }
  return fc(features);
}

/** Drill: only the provinces you've actually visited are filled; every visited
 * city is dotted. (No whole-country fill — unvisited provinces stay uncolored.) */
export function buildCountry(cities: City[], cc: string): ViewData {
  const inCc = cities.filter((c) => c.cc === cc);
  const seen = new Set<string>();
  const regionFeatures: any[] = [];
  for (const c of inCc) {
    const poly = findPoly(provinces, [c.lng, c.lat]);
    if (poly && !seen.has(poly.id)) {
      seen.add(poly.id);
      regionFeatures.push({ type: 'Feature', geometry: poly.geometry, properties: {} });
    }
  }
  return { regionFC: fc(regionFeatures), markerFC: fc(inCc.map(marker)) };
}
