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

// Poster styles (图样) — different compositions of the same map + stats.
export type TemplateKey = 'card' | 'minimal' | 'frame' | 'poster';
export const TEMPLATES: TemplateKey[] = ['card', 'minimal', 'frame', 'poster'];

interface PosterOpts {
  cities: City[];
  stats: Stats;
  theme: Theme;
  title: string;
  handle: string;
  aspect: AspectKey;
  lang: Lang;
  mode: FlightMode;
  template: TemplateKey;
  flightArcs?: any;
  flightNodes?: any;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

function waitFor(map: maplibregl.Map, event: 'load' | 'idle', timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => resolve();
    map.once(event, done);
    setTimeout(done, timeoutMs);
  });
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Where the map sits for each style (logical coords).
function mapRectFor(t: TemplateKey, w: number, h: number): Rect {
  if (t === 'poster') return { x: 0, y: 0, w, h, r: 0 };
  if (t === 'minimal') {
    const m = Math.round(w * 0.045);
    const cap = Math.round(h * 0.07); // bottom caption strip
    return { x: m, y: m, w: w - 2 * m, h: h - m - cap, r: Math.round(w * 0.03) };
  }
  if (t === 'frame') {
    const fm = Math.round(w * 0.06);
    const top = fm + Math.round(h * 0.06);
    const bot = fm + Math.round(h * 0.1);
    return { x: fm, y: top, w: w - 2 * fm, h: h - top - bot, r: Math.round(w * 0.012) };
  }
  // card
  const pad = Math.round(w * 0.055);
  const top = Math.round(h * 0.12);
  const bot = Math.round(h * 0.16);
  return { x: pad, y: top, w: w - 2 * pad, h: h - top - bot, r: Math.round(w * 0.035) };
}

const setLS = (ctx: CanvasRenderingContext2D, v: number) => {
  (ctx as any).letterSpacing = `${v}px`;
};

/** Render a social poster: offscreen MapLibre map + canvas-composited chrome. */
export async function renderPoster(opts: PosterOpts): Promise<Blob> {
  const { cities, stats, theme, title, handle, aspect, lang, mode, template, flightArcs, flightNodes } = opts;
  const { w, h } = ASPECTS[aspect];
  const c = theme.colors;
  const SCALE = 2; // supersample: 2× output pixels + 2× map render = crisper poster
  const heading = title || tr(lang, 'app.title');
  const cells: [string, string][] = [
    [String(stats.cities), tr(lang, 'stats.cities')],
    [String(stats.countries), tr(lang, 'stats.countries')],
    [String(stats.continents), tr(lang, 'stats.continents')],
    [`${stats.worldPct}%`, tr(lang, 'stats.world')],
  ];
  const mr = mapRectFor(template, w, h);

  const div = document.createElement('div');
  div.style.cssText = `position:absolute;left:-10000px;top:0;width:${mr.w}px;height:${mr.h}px;`;
  document.body.appendChild(div);

  const map = new maplibregl.Map({
    container: div,
    style: STYLE_URL,
    interactive: false,
    attributionControl: false,
    preserveDrawingBuffer: true,
    pixelRatio: SCALE,
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
    fitData(map, data, { duration: 0, padding: Math.round(mr.w * 0.08) });
    await waitFor(map, 'idle', 6000);

    const canvas = document.createElement('canvas');
    canvas.width = w * SCALE;
    canvas.height = h * SCALE;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(SCALE, SCALE);
    ctx.textBaseline = 'alphabetic';

    // background
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, w, h);

    // ── the map (rounded, with a soft card shadow for non-fullbleed styles) ──
    if (template !== 'poster') {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.22)';
      ctx.shadowBlur = Math.round(w * 0.03);
      ctx.shadowOffsetY = Math.round(w * 0.008);
      ctx.fillStyle = c.water;
      roundRectPath(ctx, mr.x, mr.y, mr.w, mr.h, mr.r);
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    roundRectPath(ctx, mr.x, mr.y, mr.w, mr.h, mr.r);
    ctx.clip();
    ctx.drawImage(map.getCanvas(), mr.x, mr.y, mr.w, mr.h);
    ctx.restore();
    if (template === 'frame') {
      ctx.strokeStyle = c.landBorder;
      ctx.lineWidth = 1.5;
      roundRectPath(ctx, mr.x, mr.y, mr.w, mr.h, mr.r);
      ctx.stroke();
    }

    // helper: stats row drawn left→right from x, baseline at y
    const drawStats = (x: number, y: number, cellW: number, numSize: number, labSize: number) => {
      cells.forEach(([v, k], i) => {
        const cx = x + i * cellW;
        ctx.textAlign = 'left';
        ctx.fillStyle = c.ink;
        ctx.font = `600 ${numSize}px ${theme.fontDisplay}`;
        ctx.fillText(v, cx, y);
        ctx.fillStyle = c.muted;
        ctx.font = `${labSize}px ${theme.fontBody}`;
        setLS(ctx, 1.2);
        ctx.fillText(k.toUpperCase(), cx, y + labSize + Math.round(w * 0.012));
        setLS(ctx, 0);
      });
    };

    const watermark = (right: number, bottom: number) => {
      ctx.textAlign = 'right';
      ctx.fillStyle = c.muted;
      ctx.font = `${Math.round(w * 0.015)}px ${theme.fontBody}`;
      ctx.fillText(tr(lang, 'poster.watermark'), right, bottom);
      ctx.font = `${Math.round(w * 0.011)}px ${theme.fontBody}`;
      ctx.fillText('© OpenStreetMap · OpenFreeMap', right, bottom + Math.round(w * 0.022));
      ctx.textAlign = 'left';
    };

    if (template === 'card') {
      const pad = mr.x;
      const tSize = Math.round(w * 0.05);
      ctx.fillStyle = c.ink;
      ctx.font = `600 ${tSize}px ${theme.fontDisplay}`;
      ctx.textAlign = 'left';
      ctx.fillText(heading, pad, Math.round(h * 0.085));
      ctx.fillStyle = c.accent;
      ctx.fillRect(pad, Math.round(h * 0.085) + Math.round(tSize * 0.22), Math.round(tSize * 1.4), Math.max(3, Math.round(tSize * 0.06)));
      if (handle) {
        ctx.fillStyle = c.muted;
        ctx.font = `${Math.round(w * 0.022)}px ${theme.fontBody}`;
        ctx.fillText(handle.startsWith('@') ? handle : `@${handle}`, pad + Math.round(tSize * 1.6), Math.round(h * 0.085) - Math.round(tSize * 0.05));
      }
      drawStats(pad, mr.y + mr.h + Math.round(h * 0.075), mr.w / 4, Math.round(w * 0.046), Math.round(w * 0.017));
      watermark(w - pad, h - Math.round(h * 0.03));
    } else if (template === 'minimal') {
      // one quiet caption line, centered under the big map
      const y = mr.y + mr.h + Math.round((h - mr.y - mr.h) * 0.62);
      ctx.textAlign = 'center';
      const tSize = Math.round(w * 0.03);
      const parts = `${heading}   ·   ${stats.cities} ${tr(lang, 'stats.cities')}   ·   ${stats.countries} ${tr(lang, 'stats.countries')}   ·   ${stats.worldPct}% ${tr(lang, 'stats.world')}`;
      ctx.fillStyle = c.ink;
      ctx.font = `600 ${tSize}px ${theme.fontBody}`;
      ctx.fillText(parts, w / 2, y);
      ctx.textAlign = 'left';
      watermark(w - mr.x, h - Math.round(h * 0.018));
    } else if (template === 'frame') {
      const tSize = Math.round(w * 0.042);
      ctx.textAlign = 'center';
      ctx.fillStyle = c.ink;
      ctx.font = `600 ${tSize}px ${theme.fontDisplay}`;
      ctx.fillText(heading, w / 2, mr.y - Math.round(h * 0.018));
      ctx.fillStyle = c.accent;
      ctx.fillRect(w / 2 - Math.round(tSize * 0.7), mr.y - Math.round(h * 0.012), Math.round(tSize * 1.4), Math.max(3, Math.round(tSize * 0.05)));
      // centered stats in the bottom margin
      const numSize = Math.round(w * 0.04);
      const labSize = Math.round(w * 0.016);
      const cellW = mr.w / 4;
      const sy = mr.y + mr.h + Math.round(h * 0.05);
      cells.forEach(([v, k], i) => {
        const cx = mr.x + i * cellW + cellW / 2;
        ctx.textAlign = 'center';
        ctx.fillStyle = c.ink;
        ctx.font = `600 ${numSize}px ${theme.fontDisplay}`;
        ctx.fillText(v, cx, sy);
        ctx.fillStyle = c.muted;
        ctx.font = `${labSize}px ${theme.fontBody}`;
        setLS(ctx, 1.2);
        ctx.fillText(k.toUpperCase(), cx, sy + labSize + Math.round(w * 0.012));
        setLS(ctx, 0);
      });
      ctx.textAlign = 'left';
      watermark(w - mr.x, h - Math.round(h * 0.022));
    } else {
      // poster: full-bleed map + gradient scrims + big overlaid text
      const topH = Math.round(h * 0.26);
      const botH = Math.round(h * 0.3);
      const topG = ctx.createLinearGradient(0, 0, 0, topH);
      topG.addColorStop(0, hexA(c.bg, 0.92));
      topG.addColorStop(1, hexA(c.bg, 0));
      ctx.fillStyle = topG;
      ctx.fillRect(0, 0, w, topH);
      const botG = ctx.createLinearGradient(0, h - botH, 0, h);
      botG.addColorStop(0, hexA(c.bg, 0));
      botG.addColorStop(1, hexA(c.bg, 0.95));
      ctx.fillStyle = botG;
      ctx.fillRect(0, h - botH, w, botH);

      const pad = Math.round(w * 0.06);
      const tSize = Math.round(w * 0.06);
      ctx.fillStyle = c.ink;
      ctx.font = `700 ${tSize}px ${theme.fontDisplay}`;
      ctx.textAlign = 'left';
      ctx.fillText(heading, pad, pad + tSize);
      ctx.fillStyle = c.accent;
      ctx.fillRect(pad, pad + tSize + Math.round(tSize * 0.2), Math.round(tSize * 1.4), Math.max(3, Math.round(tSize * 0.06)));
      if (handle) {
        ctx.fillStyle = c.muted;
        ctx.font = `${Math.round(w * 0.024)}px ${theme.fontBody}`;
        ctx.fillText(handle.startsWith('@') ? handle : `@${handle}`, pad, pad + tSize + Math.round(w * 0.06));
      }
      drawStats(pad, h - Math.round(h * 0.085), (w - 2 * pad) / 4, Math.round(w * 0.05), Math.round(w * 0.018));
      watermark(w - pad, h - Math.round(h * 0.028));
    }

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
    );
  } finally {
    map.remove();
    div.remove();
  }
}

// #rrggbb + alpha → rgba() string (for gradient scrims)
function hexA(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(0,0,0,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
