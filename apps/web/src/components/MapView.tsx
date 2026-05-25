import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  STYLE_URL,
  addLayers,
  fitData,
  recolorBase,
  recolorVisited,
  setCandidates,
  setLabelLang,
  setMarkers,
  setViewData,
  addFlightLayers,
  setArcs,
  recolorArcs,
  setFlightView,
  type FlightMode,
} from '../lib/mapStyle';
import {
  allCountriesFC,
  buildCountry,
  buildGlobal,
  candidatesFC,
  loadRegions,
  markersFC,
  type ViewData,
} from '../lib/regions';
import type { Theme } from '../theme';
import type { City } from '../types';
import { useT } from '../lib/i18n';
import { countryName } from '../lib/countries';

type View = { level: 'global' } | { level: 'country'; cc: string };

// At/above this zoom we enter "select mode": all nearby dataset cities show as
// hollow candidate dots, and clicking dots toggles selection instead of drilling.
const CANDIDATE_ZOOM = 5.5;
const CANDIDATE_CAP = 400; // most-prominent cities in view, to bound clutter/perf

interface Props {
  cities: City[];
  theme: Theme;
  /** Full city dataset — source of the on-map selectable candidate dots. */
  allCities: City[];
  /** ISO-numeric → 2-letter code, so a click resolves to a country to drill into. */
  ccnToCc: Map<string, string>;
  /** cc → [w,s,e,n] fit box (from prominent cities) for drilling into a country. */
  countryBounds: Map<string, [number, number, number, number]>;
  onAdd: (id: number) => void;
  onRemove: (id: number) => void;
  /** Add an ad-hoc place tapped on a basemap label (name + coords). */
  onPickLabel: (name: string, lng: number, lat: number) => void;
  /** Fires with the drilled-into country code (or null at the global view). */
  onFocusCountry?: (cc: string | null) => void;
  /** Flown-route great-circle arcs + endpoint dots (FeatureCollections). */
  flightArcs?: any;
  flightNodes?: any;
}

// basemap (OpenMapTiles) settlement label classes we let users tap to add
const PLACE_CLASSES = ['city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood'];

export default function MapView({
  cities,
  theme,
  allCities,
  ccnToCc,
  countryBounds,
  onAdd,
  onRemove,
  onPickLabel,
  onFocusCountry,
  flightArcs,
  flightNodes,
}: Props) {
  const { t, lang } = useT();
  const [flightMode, setFlightMode] = useState<FlightMode>('both');
  const hasFlights = (flightArcs?.features?.length ?? 0) > 0;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false); // map loaded + regions loaded + layers added
  const autoFit = useRef(true);
  const mapEdit = useRef(false); // set when a click adds/removes, to suppress refit
  const baseData = useRef<ViewData | null>(null); // last overview view data (markers/region)
  const refreshRef = useRef<() => void>(() => {});
  const [view, setView] = useState<View>({ level: 'global' });
  const [selectMode, setSelectMode] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const latest = useRef({ cities, theme, ccnToCc, allCities, onAdd, onRemove, onPickLabel, lang, flightArcs, flightNodes, flightMode });
  latest.current = { cities, theme, ccnToCc, allCities, onAdd, onRemove, onPickLabel, lang, flightArcs, flightNodes, flightMode };

  // init once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [12, 25],
      zoom: 1.2,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      preserveDrawingBuffer: true,
      clickTolerance: 6, // forgive a few px of pointer drift so trackpad/touch taps still count as clicks
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.on('dragstart', () => (autoFit.current = false));
    map.on('wheel', () => (autoFit.current = false));

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
    const showPopup = (e: maplibregl.MapLayerMouseEvent, hint: string) => {
      map.getCanvas().style.cursor = 'pointer';
      const f = e.features?.[0];
      if (!f) return;
      const p: any = f.properties;
      const name = p.zh ? `${p.zh} · ${p.label}` : p.label;
      popup
        .setLngLat((f.geometry as any).coordinates)
        .setHTML(`<div style="font-size:12px">${name}<span style="opacity:.55"> ${hint}</span></div>`)
        .addTo(map);
    };
    map.on('mouseenter', 'marker-dot', (e) =>
      showPopup(e, map.getZoom() >= CANDIDATE_ZOOM || viewRef.current.level === 'country' ? '✕' : '')
    );
    map.on('mouseleave', 'marker-dot', () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    });
    map.on('mouseenter', 'candidate-dot', (e) => showPopup(e, '＋'));
    map.on('mouseleave', 'candidate-dot', () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    });
    // basemap settlement labels become tappable in select mode (add ad-hoc place)
    for (const id of ['label_town', 'label_village', 'label_city', 'label_city_capital']) {
      map.on('mouseenter', id, (e) => {
        if (map.getZoom() < CANDIDATE_ZOOM) return;
        const f = e.features?.[0];
        if (f && !map.queryRenderedFeatures(e.point, { layers: ['candidate-dot', 'marker-dot'] }).length)
          map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
    }
    // country-hit spans every country, so the pointer cursor signals "clickable"
    // everywhere on land at the global view (visited or not).
    map.on('mouseenter', 'country-hit', () => {
      if (viewRef.current.level === 'global' && map.getZoom() < CANDIDATE_ZOOM)
        map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'country-hit', () => (map.getCanvas().style.cursor = ''));

    const drill = (cc?: string) => {
      if (cc && viewRef.current.level === 'global') {
        autoFit.current = true;
        setView({ level: 'country', cc });
      }
    };

    map.on('click', (e) => {
      const pad = 6;
      const box: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - pad, e.point.y - pad],
        [e.point.x + pad, e.point.y + pad],
      ];
      // select mode = zoomed into a region, or drilled into a country
      const selMode = map.getZoom() >= CANDIDATE_ZOOM || viewRef.current.level === 'country';
      // 1) candidate dot → add it
      const cand = map.queryRenderedFeatures(box, { layers: ['candidate-dot'] });
      if (cand[0]) {
        mapEdit.current = true;
        latest.current.onAdd(Number(cand[0].properties!.id));
        return;
      }
      // 2) visited dot → deselect (in select mode or inside a country); else drill
      const vis = map.queryRenderedFeatures(box, { layers: ['marker-dot'] });
      if (vis[0]) {
        const p: any = vis[0].properties;
        if (selMode) {
          mapEdit.current = true;
          latest.current.onRemove(Number(p.id));
        } else {
          drill(p.cc as string);
        }
        return;
      }
      // 3) select mode: a basemap settlement label (town below our dataset, e.g.
      //    Swansea/Strahan) → add it as an ad-hoc place.
      if (selMode) {
        const lbl = map
          .queryRenderedFeatures(box)
          .find(
            (f) =>
              f.sourceLayer === 'place' &&
              PLACE_CLASSES.includes((f.properties as any).class) &&
              f.geometry.type === 'Point'
          );
        if (lbl) {
          const p: any = lbl.properties;
          const name = (p['name:en'] || p['name:latin'] || p.name) as string | undefined;
          const co = (lbl.geometry as any).coordinates as [number, number];
          if (name) {
            mapEdit.current = true;
            latest.current.onPickLabel(name, co[0], co[1]);
          }
          return;
        }
      }
      // 4) empty country/region → drill (only at the global low-zoom overview)
      if (!selMode && viewRef.current.level === 'global') {
        const reg = map.queryRenderedFeatures(box, { layers: ['region-fill', 'country-hit'] });
        drill(reg.find((f) => f.properties?.cc)?.properties?.cc as string | undefined);
      }
    });

    // Show candidate dots + per-city visited dots at high zoom; restore the
    // overview markers below it. Runs on every pan/zoom and on selection change.
    const refreshOverlay = () => {
      const m = mapRef.current;
      if (!m || !ready.current) return;
      const sel = m.getZoom() >= CANDIDATE_ZOOM || viewRef.current.level === 'country';
      setSelectMode(sel);
      const selected = new Set(latest.current.cities.map((c) => c.id));
      if (sel) {
        setMarkers(m, markersFC(latest.current.cities)); // each visited city individually
        const b = m.getBounds();
        const w = b.getWest(), s = b.getSouth(), east = b.getEast(), n = b.getNorth();
        const inView: City[] = [];
        for (const c of latest.current.allCities) {
          if (selected.has(c.id)) continue;
          if (c.lng >= w && c.lng <= east && c.lat >= s && c.lat <= n) inView.push(c);
        }
        inView.sort((a, b2) => b2.prom - a.prom);
        setCandidates(m, candidatesFC(inView.slice(0, CANDIDATE_CAP)));
      } else {
        if (baseData.current) setMarkers(m, baseData.current.markerFC);
        setCandidates(m, { type: 'FeatureCollection', features: [] });
      }
    };
    refreshRef.current = refreshOverlay;
    map.on('moveend', refreshOverlay);

    map.on('load', () => {
      recolorBase(map, latest.current.theme);
      loadRegions().then(() => {
        const d = buildGlobal(latest.current.cities);
        addLayers(map, latest.current.theme, d, allCountriesFC(latest.current.ccnToCc));
        setLabelLang(map, latest.current.lang);
        const empty = { type: 'FeatureCollection', features: [] };
        addFlightLayers(map, latest.current.theme, latest.current.flightArcs ?? empty, latest.current.flightNodes ?? empty);
        setFlightView(map, latest.current.flightMode);
        baseData.current = d;
        fitData(map, d, { duration: 0 });
        ready.current = true;
        refreshOverlay();
      });
    });

    mapRef.current = map;
    (window as any).__map = map; // debug handle
    return () => {
      map.remove();
      mapRef.current = null;
      ready.current = false;
    };
  }, []);

  // cities / view changed
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const d = view.level === 'global' ? buildGlobal(cities) : buildCountry(cities, view.cc);
    setViewData(map, d);
    baseData.current = d;
    const skipFit = mapEdit.current;
    mapEdit.current = false;
    if (!skipFit && autoFit.current) {
      // drilled into a country with no visited cities → fit its prominent-cities box
      const bb =
        view.level === 'country' && d.markerFC.features.length === 0
          ? countryBounds.get(view.cc)
          : undefined;
      if (bb) map.fitBounds(bb, { padding: 60, maxZoom: 6, duration: 700 });
      else fitData(map, d);
    }
    refreshRef.current(); // re-apply select-mode overlay for the current zoom
  }, [cities, view, ccnToCc, countryBounds]);

  // theme changed
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    recolorBase(map, theme);
    recolorVisited(map, theme);
    recolorArcs(map, theme);
  }, [theme]);

  // language changed → relabel basemap + overlay place labels
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    setLabelLang(map, lang);
  }, [lang]);

  // flight data arrived / changed → update arc + node sources
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current || !flightArcs) return;
    setArcs(map, flightArcs, flightNodes ?? { type: 'FeatureCollection', features: [] });
  }, [flightArcs, flightNodes]);

  // view-mode toggle → show/hide city vs route layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    setFlightView(map, flightMode);
  }, [flightMode]);

  // tell the parent which country is focused (drives country-scoped recs)
  useEffect(() => {
    onFocusCountry?.(view.level === 'country' ? view.cc : null);
  }, [view, onFocusCountry]);

  const focusCountry =
    view.level === 'country'
      ? countryName(view.cc, allCities.find((c) => c.cc === view.cc)?.country ?? '', lang)
      : '';

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {hasFlights && (
        <div className="absolute right-3 top-3 z-10 flex gap-1 rounded-full border border-land-border bg-surface/90 p-1 shadow-soft backdrop-blur">
          {(['both', 'cities', 'routes'] as FlightMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setFlightMode(m)}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                flightMode === m ? 'bg-accent text-white' : 'text-muted hover:text-ink'
              }`}
            >
              {t(`flight.${m}`)}
            </button>
          ))}
        </div>
      )}
      {view.level === 'country' && (
        <button
          onClick={() => {
            autoFit.current = true;
            setView({ level: 'global' });
          }}
          className="absolute left-3 top-3 z-10 rounded-full border border-land-border bg-surface/90 px-3 py-1.5 text-xs text-ink shadow-soft backdrop-blur hover:border-accent"
        >
          ← {t('map.back')}{focusCountry ? ` · ${focusCountry}` : ''}
        </button>
      )}
      {selectMode && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-land-border bg-surface/90 px-3 py-1 text-xs text-muted shadow-soft backdrop-blur">
          {t('map.selectHint')}
        </div>
      )}
    </div>
  );
}
