import maplibregl from 'maplibre-gl';
import {
  STYLE_URL, addLayers, fitData, recolorBase, setLabelLang,
  addFlightLayers, setFlightView, type FlightMode,
} from './mapStyle';
import { buildGlobal, loadRegions } from './regions';
import type { Stats } from './stats';
import type { Theme } from '../theme';
import type { City } from '../types';
import { tr, type Lang } from './i18n';

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

export type AspectKey = 'square' | 'story' | 'wide';

// `ratio` is language-neutral; the descriptive word is translated at render time.
export const ASPECTS: Record<AspectKey, { w: number; h: number; ratio: string }> = {
  square: { w: 1080, h: 1080, ratio: '1:1' },
  story: { w: 1080, h: 1920, ratio: '9:16' },
  wide: { w: 1600, h: 900, ratio: '16:9' },
};

interface PosterOpts {
  cities: City[];
  stats: Stats;
  theme: Theme;
  title: string;
  handle: string;
  aspect: AspectKey;
  lang: Lang;
  mode: FlightMode;
  flightArcs?: any;
  flightNodes?: any;
}

function waitFor(map: maplibregl.Map, event: 'load' | 'idle', timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => resolve();
    map.once(event, done);
    setTimeout(done, timeoutMs);
  });
}

/** Render a social poster: offscreen MapLibre map + canvas-composited text. */
export async function renderPoster(opts: PosterOpts): Promise<Blob> {
  const { cities, stats, theme, title, handle, aspect, lang, mode, flightArcs, flightNodes } = opts;
  const { w, h } = ASPECTS[aspect];
  const c = theme.colors;
  const SCALE = 2; // supersample: 2× output pixels + 2× map render = crisper poster

  const pad = Math.round(w * 0.06);
  const titleSize = Math.round(w * 0.05);
  const titleY = pad + titleSize;
  const subSize = Math.round(w * 0.022);
  const subY = titleY + Math.round(w * 0.035);
  const footerH = Math.round(h * 0.16);
  const mapX = pad;
  const mapY = subY + Math.round(w * 0.03);
  const mapW = w - 2 * pad;
  const mapH = h - footerH - mapY;

  const div = document.createElement('div');
  div.style.cssText = `position:absolute;left:-10000px;top:0;width:${mapW}px;height:${mapH}px;`;
  document.body.appendChild(div);

  const map = new maplibregl.Map({
    container: div,
    style: STYLE_URL,
    interactive: false,
    attributionControl: false,
    preserveDrawingBuffer: true,
    pixelRatio: SCALE, // render the map at 2× device pixels (labels keep their size)
    fadeDuration: 0,
    center: [12, 25],
    zoom: 1,
  });

  try {
    await waitFor(map, 'load', 15000);
    recolorBase(map, theme);
    await loadRegions();
    const data = buildGlobal(cities);
    addLayers(map, theme, data);
    setLabelLang(map, lang);
    addFlightLayers(map, theme, flightArcs ?? EMPTY_FC, flightNodes ?? EMPTY_FC);
    setFlightView(map, mode);
    fitData(map, data, { duration: 0, padding: Math.round(mapW * 0.08) });
    await waitFor(map, 'idle', 6000);

    const canvas = document.createElement('canvas');
    canvas.width = w * SCALE;
    canvas.height = h * SCALE;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(SCALE, SCALE); // draw using logical coords; output at 2×

    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(map.getCanvas(), mapX, mapY, mapW, mapH);

    // title + accent underline
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = c.ink;
    ctx.font = `600 ${titleSize}px ${theme.fontDisplay}`;
    ctx.fillText(title || tr(lang, 'app.title'), pad, titleY);
    ctx.fillStyle = c.accent;
    ctx.fillRect(
      pad,
      titleY + Math.round(titleSize * 0.18),
      Math.round(titleSize * 1.4),
      Math.max(3, Math.round(titleSize * 0.06))
    );
    if (handle) {
      ctx.fillStyle = c.muted;
      ctx.font = `${subSize}px ${theme.fontBody}`;
      ctx.fillText(handle.startsWith('@') ? handle : `@${handle}`, pad, subY);
    }

    // stats row
    const numSize = Math.round(w * 0.046);
    const labSize = Math.round(w * 0.018);
    const statsY = h - footerH + Math.round(footerH * 0.42);
    const cellW = (w - 2 * pad) / 4;
    const cells = [
      [String(stats.cities), tr(lang, 'stats.cities')],
      [String(stats.countries), tr(lang, 'stats.countries')],
      [String(stats.continents), tr(lang, 'stats.continents')],
      [`${stats.worldPct}%`, tr(lang, 'stats.world')],
    ];
    cells.forEach(([v, k], i) => {
      const cx = pad + i * cellW;
      ctx.fillStyle = c.ink;
      ctx.font = `600 ${numSize}px ${theme.fontDisplay}`;
      ctx.fillText(v, cx, statsY);
      ctx.fillStyle = c.muted;
      ctx.font = `${labSize}px ${theme.fontBody}`;
      ctx.fillText(k, cx, statsY + labSize + 8);
    });

    // watermark + required tile attribution
    ctx.textAlign = 'right';
    ctx.fillStyle = c.muted;
    ctx.font = `${Math.round(w * 0.016)}px ${theme.fontBody}`;
    ctx.fillText(tr(lang, 'poster.watermark'), w - pad, h - Math.round(pad * 0.55));
    ctx.font = `${Math.round(w * 0.012)}px ${theme.fontBody}`;
    ctx.fillText('© OpenStreetMap · OpenFreeMap', w - pad, h - Math.round(pad * 0.28));
    ctx.textAlign = 'left';

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
    );
  } finally {
    map.remove();
    div.remove();
  }
}
