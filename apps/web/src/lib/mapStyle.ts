import maplibregl from 'maplibre-gl';
import type { ViewData } from './regions';
import type { Theme } from '../theme';

// OpenFreeMap public instance — keyless, no usage limits, attribution auto-added.
export const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

/** Recolor positron to a theme (land = the `background` layer; water on top). */
export function recolorBase(map: maplibregl.Map, theme: Theme): void {
  const c = theme.colors;
  const set = (id: string, prop: string, val: string) => {
    if (map.getLayer(id)) {
      try {
        map.setPaintProperty(id, prop as any, val);
      } catch {
        /* layer differs between style versions */
      }
    }
  };
  set('background', 'background-color', c.land);
  set('water', 'fill-color', c.water);
  for (const b of ['boundary_2', 'boundary_3', 'boundary_disputed']) set(b, 'line-color', c.landBorder);
}

/** Region fill+outline (below basemap labels) and marker glow/dot/label (on top).
 * `hitFC`, if given, becomes an invisible all-countries fill used only for click
 * hit-testing (so unvisited countries are clickable too). */
export function addLayers(map: maplibregl.Map, theme: Theme, data: ViewData, hitFC?: any): void {
  const c = theme.colors;
  const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;

  if (hitFC && !map.getSource('country-hit')) map.addSource('country-hit', { type: 'geojson', data: hitFC });
  if (hitFC && !map.getLayer('country-hit')) {
    map.addLayer(
      { id: 'country-hit', type: 'fill', source: 'country-hit', paint: { 'fill-color': '#000', 'fill-opacity': 0 } },
      firstSymbol
    );
  }

  if (!map.getSource('region')) map.addSource('region', { type: 'geojson', data: data.regionFC });
  if (!map.getSource('markers')) map.addSource('markers', { type: 'geojson', data: data.markerFC });

  if (!map.getLayer('region-fill')) {
    map.addLayer(
      { id: 'region-fill', type: 'fill', source: 'region', paint: { 'fill-color': c.accent, 'fill-opacity': 0.25 } },
      firstSymbol
    );
  }
  if (!map.getLayer('region-outline')) {
    map.addLayer(
      { id: 'region-outline', type: 'line', source: 'region', paint: { 'line-color': c.accent, 'line-width': 1.2, 'line-opacity': 0.55 } },
      firstSymbol
    );
  }
  // candidate dots (dataset cities offered for selection at high zoom) — hollow
  // style, below the visited markers so visited stays visually dominant.
  if (!map.getSource('candidates'))
    map.addSource('candidates', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  if (!map.getLayer('candidate-dot')) {
    map.addLayer({
      id: 'candidate-dot',
      type: 'circle',
      source: 'candidates',
      paint: {
        'circle-radius': 4,
        'circle-color': c.surface,
        'circle-stroke-color': c.muted,
        'circle-stroke-width': 1.5,
        'circle-opacity': 0.9,
      },
    });
  }
  if (!map.getLayer('candidate-label')) {
    map.addLayer({
      id: 'candidate-label',
      type: 'symbol',
      source: 'candidates',
      minzoom: 6.5,
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-offset': [0, 1],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: { 'text-color': c.muted, 'text-halo-color': c.water, 'text-halo-width': 1.2 },
    });
  }
  // Radius scales with zoom: compact at world view (so dense regions stay tidy),
  // growing as you zoom in. `r` is the per-city base radius (by prominence).
  const dotRadius = [
    'interpolate', ['linear'], ['zoom'],
    1.5, ['*', ['get', 'r'], 0.5],
    4, ['*', ['get', 'r'], 0.85],
    8, ['*', ['get', 'r'], 1.3],
  ] as any;
  if (!map.getLayer('marker-glow')) {
    map.addLayer({
      id: 'marker-glow',
      type: 'circle',
      source: 'markers',
      paint: {
        'circle-radius': ['*', dotRadius, 1.7] as any,
        'circle-color': c.dot,
        'circle-blur': 1,
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 1.5, 0.12, 6, 0.28] as any,
      },
    });
  }
  if (!map.getLayer('marker-dot')) {
    map.addLayer({
      id: 'marker-dot',
      type: 'circle',
      source: 'markers',
      paint: {
        'circle-radius': dotRadius,
        'circle-color': c.dot,
        'circle-stroke-color': c.surface,
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 1.5, 0.6, 5, 1.5] as any,
        'circle-opacity': 0.9,
      },
    });
  }
  if (!map.getLayer('marker-label')) {
    map.addLayer({
      id: 'marker-label',
      type: 'symbol',
      source: 'markers',
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 12,
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: { 'text-color': c.ink, 'text-halo-color': c.water, 'text-halo-width': 1.5 },
    });
  }
}

// Localized name expressions for the basemap's own label layers. OpenFreeMap
// serves CJK glyphs for every Noto fontstack (Regular/Bold/Italic), so this is
// tofu-free. zh prefers the Chinese exonym, then the local script, then latin.
const NAME_EXPR_ZH: any = [
  'coalesce',
  ['get', 'name:zh'],
  ['get', 'name:zh-Hans'],
  ['get', 'name:nonlatin'],
  ['get', 'name:latin'],
  ['get', 'name_en'],
  ['get', 'name'],
];
const NAME_EXPR_EN: any = [
  'coalesce',
  ['get', 'name:en'],
  ['get', 'name_en'],
  ['get', 'name:latin'],
  ['get', 'name'],
];

/** Switch every place label (basemap + our city overlays) to zh or en. Safe to
 * call repeatedly; skips road shields (numeric refs) and missing layers. */
export function setLabelLang(map: maplibregl.Map, lang: 'zh' | 'en'): void {
  const nameExpr = lang === 'zh' ? NAME_EXPR_ZH : NAME_EXPR_EN;
  for (const l of map.getStyle().layers ?? []) {
    if (l.type !== 'symbol' || l.id === 'marker-label' || l.id === 'candidate-label') continue;
    const tf = (l as any).layout?.['text-field'];
    if (!tf) continue;
    const s = JSON.stringify(tf);
    if (!s.includes('name') || s.includes('"ref"')) continue; // skip shields / non-name labels
    try {
      map.setLayoutProperty(l.id, 'text-field', nameExpr);
    } catch {
      /* layer differs between style versions */
    }
  }
  // our overlay features carry { label: en, zh } where zh is '' when unknown
  const overlayExpr: any =
    lang === 'zh'
      ? ['case', ['!=', ['get', 'zh'], ''], ['get', 'zh'], ['get', 'label']]
      : ['get', 'label'];
  for (const id of ['marker-label', 'candidate-label']) {
    if (map.getLayer(id)) {
      try {
        map.setLayoutProperty(id, 'text-field', overlayExpr);
      } catch {
        /* ignore */
      }
    }
  }
}

export type FlightMode = 'both' | 'cities' | 'routes';

const CITY_LAYERS = [
  'region-fill', 'region-outline', 'marker-glow', 'marker-dot', 'marker-label',
  'candidate-dot', 'candidate-label',
];
const ARC_LAYERS = ['arc-glow', 'arc-line'];

/** Add the flight arcs (glowing great-circle lines) + endpoint dots. Arcs sit
 * above region fills but below the city markers so dots stay readable. */
export function addFlightLayers(map: maplibregl.Map, theme: Theme, arcFC: any, nodeFC: any): void {
  const c = theme.colors;
  if (!map.getSource('arcs')) map.addSource('arcs', { type: 'geojson', data: arcFC });
  if (!map.getSource('flight-nodes')) map.addSource('flight-nodes', { type: 'geojson', data: nodeFC });

  const before = map.getLayer('marker-glow') ? 'marker-glow' : undefined;
  // width/opacity grow with how often a route was flown (n)
  const widthByN = ['interpolate', ['linear'], ['get', 'n'], 1, 0.6, 4, 1.4, 20, 3, 60, 5] as any;
  if (!map.getLayer('arc-glow')) {
    map.addLayer({
      id: 'arc-glow', type: 'line', source: 'arcs',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': c.accent,
        'line-width': ['*', widthByN, 3] as any,
        'line-opacity': 0.18,
        'line-blur': 6,
      },
    }, before);
  }
  if (!map.getLayer('arc-line')) {
    map.addLayer({
      id: 'arc-line', type: 'line', source: 'arcs',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': c.accent,
        'line-width': widthByN,
        'line-opacity': ['interpolate', ['linear'], ['get', 'n'], 1, 0.5, 20, 0.85] as any,
      },
    }, before);
  }
  if (!map.getLayer('flight-node')) {
    map.addLayer({
      id: 'flight-node', type: 'circle', source: 'flight-nodes',
      paint: {
        'circle-radius': 2.6,
        'circle-color': c.dot,
        'circle-stroke-color': c.surface,
        'circle-stroke-width': 1,
        'circle-opacity': 0.95,
      },
    });
  }
}

export function setArcs(map: maplibregl.Map, arcFC: any, nodeFC: any): void {
  (map.getSource('arcs') as maplibregl.GeoJSONSource | undefined)?.setData(arcFC);
  (map.getSource('flight-nodes') as maplibregl.GeoJSONSource | undefined)?.setData(nodeFC);
}

export function recolorArcs(map: maplibregl.Map, theme: Theme): void {
  const c = theme.colors;
  for (const id of ARC_LAYERS) if (map.getLayer(id)) map.setPaintProperty(id, 'line-color', c.accent);
  if (map.getLayer('flight-node')) {
    map.setPaintProperty('flight-node', 'circle-color', c.dot);
    map.setPaintProperty('flight-node', 'circle-stroke-color', c.surface);
  }
}

/** Show/hide the city vs route layer groups for the 3-way view toggle. */
export function setFlightView(map: maplibregl.Map, mode: FlightMode): void {
  const vis = (id: string, on: boolean) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  };
  for (const id of CITY_LAYERS) vis(id, mode !== 'routes');
  for (const id of ARC_LAYERS) vis(id, mode !== 'cities');
  // endpoint dots only when the full city markers are hidden (routes-only view)
  vis('flight-node', mode === 'routes');
}

export function setViewData(map: maplibregl.Map, data: ViewData): void {
  (map.getSource('region') as maplibregl.GeoJSONSource | undefined)?.setData(data.regionFC);
  (map.getSource('markers') as maplibregl.GeoJSONSource | undefined)?.setData(data.markerFC);
}

export function setMarkers(map: maplibregl.Map, fcData: any): void {
  (map.getSource('markers') as maplibregl.GeoJSONSource | undefined)?.setData(fcData);
}

export function setCandidates(map: maplibregl.Map, fcData: any): void {
  (map.getSource('candidates') as maplibregl.GeoJSONSource | undefined)?.setData(fcData);
}

export function recolorVisited(map: maplibregl.Map, theme: Theme): void {
  const c = theme.colors;
  if (map.getLayer('region-fill')) map.setPaintProperty('region-fill', 'fill-color', c.accent);
  if (map.getLayer('region-outline')) map.setPaintProperty('region-outline', 'line-color', c.accent);
  if (map.getLayer('marker-glow')) map.setPaintProperty('marker-glow', 'circle-color', c.dot);
  if (map.getLayer('marker-dot')) {
    map.setPaintProperty('marker-dot', 'circle-color', c.dot);
    map.setPaintProperty('marker-dot', 'circle-stroke-color', c.surface);
  }
  if (map.getLayer('marker-label')) {
    map.setPaintProperty('marker-label', 'text-color', c.ink);
    map.setPaintProperty('marker-label', 'text-halo-color', c.water);
  }
  if (map.getLayer('candidate-dot')) {
    map.setPaintProperty('candidate-dot', 'circle-color', c.surface);
    map.setPaintProperty('candidate-dot', 'circle-stroke-color', c.muted);
  }
  if (map.getLayer('candidate-label')) {
    map.setPaintProperty('candidate-label', 'text-color', c.muted);
    map.setPaintProperty('candidate-label', 'text-halo-color', c.water);
  }
}

function boundsOfFC(fcData: any): maplibregl.LngLatBounds | null {
  const b = new maplibregl.LngLatBounds();
  let has = false;
  const scan = (co: any) => {
    if (typeof co[0] === 'number') {
      b.extend(co as [number, number]);
      has = true;
    } else for (const x of co) scan(x);
  };
  for (const f of fcData.features) if (f.geometry) scan(f.geometry.coordinates);
  return has ? b : null;
}

export function fitData(map: maplibregl.Map, data: ViewData, opts?: { duration?: number; padding?: number }): void {
  const duration = opts?.duration ?? 700;
  const padding = opts?.padding ?? 60;
  const pts: [number, number][] = data.markerFC.features.map((f: any) => f.geometry.coordinates);
  if (pts.length === 0) {
    // no city dots (e.g. drilled into an unvisited country) → fit to the filled region
    const rb = boundsOfFC(data.regionFC);
    if (rb) {
      map.fitBounds(rb, { padding, maxZoom: 6, duration });
      return;
    }
    map.easeTo({ center: [12, 25], zoom: 1.2, duration });
    return;
  }
  if (pts.length === 1) {
    map.easeTo({ center: pts[0], zoom: 4.5, duration });
    return;
  }
  const b = new maplibregl.LngLatBounds();
  for (const p of pts) b.extend(p);
  map.fitBounds(b, { padding, maxZoom: 7, duration });
}
