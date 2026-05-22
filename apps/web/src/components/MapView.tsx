import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { STYLE_URL, addLayers, fitData, recolorBase, recolorVisited, setViewData } from '../lib/mapStyle';
import { buildCountry, buildGlobal, loadRegions } from '../lib/regions';
import type { Theme } from '../theme';
import type { City } from '../types';

type View = { level: 'global' } | { level: 'country'; cc: string };

interface Props {
  cities: City[];
  theme: Theme;
}

export default function MapView({ cities, theme }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false); // map loaded + regions loaded + layers added
  const autoFit = useRef(true);
  const [view, setView] = useState<View>({ level: 'global' });
  const viewRef = useRef(view);
  viewRef.current = view;
  const latest = useRef({ cities, theme });
  latest.current = { cities, theme };

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
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.on('dragstart', () => (autoFit.current = false));
    map.on('wheel', () => (autoFit.current = false));

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
    map.on('mouseenter', 'marker-dot', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const f = e.features?.[0];
      if (!f) return;
      const p: any = f.properties;
      popup
        .setLngLat((f.geometry as any).coordinates)
        .setHTML(`<div style="font-size:12px">${p.zh ? `${p.zh} · ${p.label}` : p.label}</div>`)
        .addTo(map);
    });
    map.on('mouseleave', 'marker-dot', () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    });
    map.on('mouseenter', 'region-fill', () => {
      if (viewRef.current.level === 'global') map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'region-fill', () => (map.getCanvas().style.cursor = ''));

    const drill = (cc?: string) => {
      if (cc && viewRef.current.level === 'global') {
        autoFit.current = true;
        setView({ level: 'country', cc });
      }
    };
    map.on('click', 'region-fill', (e) => drill(e.features?.[0]?.properties?.cc as string));
    map.on('click', 'marker-dot', (e) => drill(e.features?.[0]?.properties?.cc as string));

    map.on('load', () => {
      recolorBase(map, latest.current.theme);
      loadRegions().then(() => {
        const d = buildGlobal(latest.current.cities);
        addLayers(map, latest.current.theme, d);
        fitData(map, d, { duration: 0 });
        ready.current = true;
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
    if (autoFit.current || view.level === 'country') fitData(map, d);
  }, [cities, view]);

  // theme changed
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    recolorBase(map, theme);
    recolorVisited(map, theme);
  }, [theme]);

  const countryName =
    view.level === 'country' ? cities.find((c) => c.cc === view.cc)?.country ?? '' : '';

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {view.level === 'country' && (
        <button
          onClick={() => {
            autoFit.current = true;
            setView({ level: 'global' });
          }}
          className="absolute left-3 top-3 z-10 rounded-full border border-land-border bg-surface/90 px-3 py-1.5 text-xs text-ink shadow-soft backdrop-blur hover:border-accent"
        >
          ← 返回世界{countryName ? ` · ${countryName}` : ''}
        </button>
      )}
    </div>
  );
}
