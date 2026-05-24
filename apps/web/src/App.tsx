import { useEffect, useMemo, useRef, useState } from 'react';
import { useCityData } from './hooks/useCityData';
import { useVisited } from './hooks/useVisited';
import { useCustomPlaces, customPlaceId } from './hooks/useCustomPlaces';
import { computeStats } from './lib/stats';
import { api } from './lib/api';
import { applyTheme, themes } from './theme';
import type { City } from './types';
import SearchBox from './components/SearchBox';
import RecommendationChips from './components/RecommendationChips';
import SmartExpand from './components/SmartExpand';
import SelectedCities from './components/SelectedCities';
import StatsBar from './components/StatsBar';
import MapView from './components/MapView';
import ThemeSwitcher from './components/ThemeSwitcher';
import ExportPanel from './components/ExportPanel';

export default function App() {
  const { data, error } = useCityData();
  const { ids, add, remove, clear, replace } = useVisited();
  const { places: customPlaces, addPlace } = useCustomPlaces();

  const [themeName, setThemeName] = useState<string>(
    () => localStorage.getItem('theme.v1') || 'claude'
  );
  const theme = themes[themeName] ?? themes.claude;
  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('theme.v1', theme.name);
  }, [theme]);

  // ── server sync: shared link wins, else restore backup if local is empty ──
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const m = location.pathname.match(/^\/s\/([\w-]+)/);
    if (m) {
      api.loadShare(m[1])
        .then((shared) => {
          replace(shared);
          window.history.replaceState({}, '', '/');
        })
        .catch(() => {});
    } else if (ids.length === 0) {
      api.loadMap().then((srv) => srv.length && replace(srv)).catch(() => {});
    }
  }, [ids.length, replace]);

  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!booted.current) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => api.saveMap(ids).catch(() => {}), 700);
  }, [ids]);

  const ccnToCc = useMemo(
    () => new Map((data?.all ?? []).map((c) => [c.ccn, c.cc] as [string, string])),
    [data]
  );
  // Per-country fit box from its most prominent cities — robust against far-flung
  // overseas territories / antimeridian that wreck a raw country-polygon bbox.
  const countryBounds = useMemo(() => {
    const byCc = new Map<string, City[]>();
    for (const c of data?.all ?? []) {
      const a = byCc.get(c.cc);
      if (a) a.push(c);
      else byCc.set(c.cc, [c]);
    }
    const out = new Map<string, [number, number, number, number]>();
    for (const [cc, list] of byCc) {
      const top = [...list].sort((a, b) => b.prom - a.prom).slice(0, 25);
      let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
      for (const c of top) {
        if (c.lng < w) w = c.lng;
        if (c.lng > e) e = c.lng;
        if (c.lat < s) s = c.lat;
        if (c.lat > n) n = c.lat;
      }
      out.set(cc, [w, s, e, n]);
    }
    return out;
  }, [data]);
  // id → City, including ad-hoc places picked from the basemap, so their negative
  // ids resolve everywhere (selection, map, stats, grouping, export).
  const byIdAll = useMemo(() => {
    const m = new Map<number, City>(data?.byId ?? []);
    for (const p of customPlaces) m.set(p.id, p);
    return m;
  }, [data, customPlaces]);

  // Add a place clicked straight off the basemap. Country/continent are inherited
  // from the nearest dataset city — robust against coastal point-in-polygon misses
  // (a deep-inlet town like Strahan falls outside the simplified country border).
  const onPickLabel = useMemo(
    () => (name: string, lng: number, lat: number) => {
      const id = customPlaceId(name, lng, lat);
      if (!byIdAll.has(id) && data) {
        let near: City | null = null;
        let best = Infinity;
        for (const c of data.all) {
          const d = (c.lng - lng) ** 2 + (c.lat - lat) ** 2;
          if (d < best) {
            best = d;
            near = c;
          }
        }
        addPlace({
          id,
          en: name,
          zh: /[一-鿿]/.test(name) ? name : null,
          country: near?.country ?? '',
          cc: near?.cc ?? '',
          ccn: near?.ccn ?? '',
          cont: near?.cont ?? '',
          lat,
          lng,
          pop: 0,
          prom: 5,
          fcode: 'CUSTOM',
          adm1: 'CUSTOM-' + id,
        });
      }
      add(id);
    },
    [byIdAll, data, addPlace, add]
  );

  const selectedSet = useMemo(() => new Set(ids), [ids]);
  const selected = useMemo<City[]>(
    () => (data ? (ids.map((id) => byIdAll.get(id)).filter(Boolean) as City[]) : []),
    [ids, data, byIdAll]
  );
  const stats = useMemo(() => computeStats(selected), [selected]);
  const newestId = ids.length ? ids[ids.length - 1] : undefined;

  const [focusCc, setFocusCc] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const onShare = async () => {
    try {
      const code = await api.share(ids);
      const url = `${location.origin}/s/${code}`;
      setShareUrl(url);
      navigator.clipboard?.writeText(url).catch(() => {});
    } catch {
      /* ignore */
    }
  };

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        数据加载失败：{error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-muted">正在加载城市数据…</div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-[1400px] flex-col gap-4 p-4 md:p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-ink">我的世界地图</h1>
          <p className="mt-0.5 text-sm text-muted">选择去过的城市，看着它在地图上长出来</p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeSwitcher value={themeName} onChange={setThemeName} />
          <button
            onClick={onShare}
            disabled={selected.length === 0}
            className="rounded-full border border-land-border px-4 py-1.5 text-sm text-ink hover:border-accent disabled:opacity-40"
          >
            分享
          </button>
          <button
            onClick={() => setShowExport(true)}
            disabled={selected.length === 0}
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            导出图片
          </button>
        </div>
      </header>

      {shareUrl && (
        <div className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft/30 px-4 py-2 text-sm">
          <span className="text-muted">已复制分享链接：</span>
          <input
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 bg-transparent text-ink outline-none"
          />
          <button onClick={() => setShareUrl(null)} className="text-muted hover:text-accent">
            ×
          </button>
        </div>
      )}

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[380px_1fr]">
        <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto rounded-2xl border border-land-border bg-bg/40 p-4">
          <SearchBox data={data} selected={selectedSet} onAdd={add} />
          <RecommendationChips data={data} ids={ids} onAdd={add} focusCc={focusCc} />
          <SmartExpand data={data} ids={ids} newestId={newestId} onAdd={add} />
          <SelectedCities cities={[...selected].reverse()} onRemove={remove} onClear={clear} />
        </aside>

        <section className="relative min-h-[320px] overflow-hidden rounded-2xl border border-land-border bg-surface">
          <div className="absolute left-4 top-4 z-10">
            <StatsBar stats={stats} />
          </div>
          <MapView
            cities={selected}
            theme={theme}
            allCities={data.all}
            ccnToCc={ccnToCc}
            countryBounds={countryBounds}
            onAdd={add}
            onRemove={remove}
            onPickLabel={onPickLabel}
            onFocusCountry={setFocusCc}
          />
        </section>
      </main>

      {showExport && (
        <ExportPanel
          cities={selected}
          stats={stats}
          theme={theme}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
