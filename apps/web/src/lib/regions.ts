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
    countriesById = new Map(
      cfc.features.map((f: any) => [
        String(f.id),
        { id: String(f.id), geometry: f.geometry, bbox: bboxOf(f.geometry) } as Poly,
      ])
    );
  })();
  return ready;
}

export function dotR(prom: number): number {
  return Math.max(4, Math.min(9, 4 + (prom - 3)));
}

const fc = (features: any[]) => ({ type: 'FeatureCollection', features });
const marker = (c: City) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
  properties: { cc: c.cc, label: c.en, zh: c.zh || '', r: dotR(c.prom) },
});

export interface ViewData {
  regionFC: any;
  markerFC: any;
}

/** Global: countries filled, one dot per visited province (cc+adm1 group). */
export function buildGlobal(cities: City[]): ViewData {
  const repByCc = new Map<string, City>();
  for (const c of cities) {
    const r = repByCc.get(c.cc);
    if (!r || c.prom > r.prom) repByCc.set(c.cc, c);
  }
  const seen = new Set<string>();
  const regionFeatures: any[] = [];
  for (const [cc, rep] of repByCc) {
    const poly = countriesById.get(rep.ccn);
    if (poly && !seen.has(poly.id)) {
      seen.add(poly.id);
      regionFeatures.push({ type: 'Feature', geometry: poly.geometry, properties: { cc } });
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

/** Drill: provinces of one country filled, every visited city dotted. */
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
