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

/** Region fill+outline (below basemap labels) and marker glow/dot/label (on top). */
export function addLayers(map: maplibregl.Map, theme: Theme, data: ViewData): void {
  const c = theme.colors;
  const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;

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
  if (!map.getLayer('marker-glow')) {
    map.addLayer({
      id: 'marker-glow',
      type: 'circle',
      source: 'markers',
      paint: { 'circle-radius': ['*', ['get', 'r'], 2.2], 'circle-color': c.dot, 'circle-blur': 1, 'circle-opacity': 0.3 },
    });
  }
  if (!map.getLayer('marker-dot')) {
    map.addLayer({
      id: 'marker-dot',
      type: 'circle',
      source: 'markers',
      paint: { 'circle-radius': ['get', 'r'], 'circle-color': c.dot, 'circle-stroke-color': c.surface, 'circle-stroke-width': 2 },
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

export function setViewData(map: maplibregl.Map, data: ViewData): void {
  (map.getSource('region') as maplibregl.GeoJSONSource | undefined)?.setData(data.regionFC);
  (map.getSource('markers') as maplibregl.GeoJSONSource | undefined)?.setData(data.markerFC);
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
}

export function fitData(map: maplibregl.Map, data: ViewData, opts?: { duration?: number; padding?: number }): void {
  const duration = opts?.duration ?? 700;
  const padding = opts?.padding ?? 60;
  const pts: [number, number][] = data.markerFC.features.map((f: any) => f.geometry.coordinates);
  if (pts.length === 0) {
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
