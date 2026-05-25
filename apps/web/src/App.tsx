import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCityData } from './hooks/useCityData';
import { useVisited } from './hooks/useVisited';
import { useCustomPlaces, customPlaceId } from './hooks/useCustomPlaces';
import { useFlights } from './hooks/useFlights';
import { arcsFC, nodesFC } from './lib/arcs';
import { computeStats } from './lib/stats';
import { api } from './lib/api';
import { applyTheme, themes } from './theme';
import { useT } from './lib/i18n';
import type { City } from './types';
import SearchBox from './components/SearchBox';
import RecommendationChips from './components/RecommendationChips';
import SmartExpand from './components/SmartExpand';
import SelectedCities from './components/SelectedCities';
import StatsBar from './components/StatsBar';
import MapView from './components/MapView';
import ThemeSwitcher from './components/ThemeSwitcher';
import ExportPanel from './components/ExportPanel';
import UserMenu from './components/UserMenu';
import LangSwitcher from './components/LangSwitcher';
import RoutesPanel from './components/RoutesPanel';

export default function App() {
  const { t } = useT();
  const { data, error } = useCityData();
  const { ids, add, remove, clear, replace } = useVisited();
  const { places: customPlaces, addPlace } = useCustomPlaces();
  const { routes: flightRoutes, addRoute, removeRoute, setRouteCount, upsertRoutes } = useFlights();

  const [themeName, setThemeName] = useState<string>(
    () => localStorage.getItem('theme.v1') || 'claude'
  );
  const theme = themes[themeName] ?? themes.claude;
  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('theme.v1', theme.name);
  }, [theme]);

  // ── server sync: a shared link wins; otherwise the server is authoritative ──
  // for the current user. A fresh browser OR one whose local cache has drifted
  // (the bug that silently lost the AU/NZ map) converges to the server copy
  // instead of pushing its stale cache back up. If the server is empty but we
  // have a local cache, seed the server from it (first run / migration).
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
    } else {
      api.loadMap()
        .then((srv) => {
          if (srv.length) replace(srv);
          else if (ids.length) api.saveMap(ids).catch(() => {});
        })
        .catch(() => {});
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

  // Resolve editable {a,b,n} routes to drawable arcs via the city coords; skip any
  // whose endpoints don't resolve (e.g. a city removed from the dataset).
  const resolvedRoutes = useMemo(() => {
    const out = [];
    for (const r of flightRoutes) {
      const A = byIdAll.get(r.a);
      const B = byIdAll.get(r.b);
      if (A && B) out.push({ a: r.a, b: r.b, n: r.n, from: [A.lng, A.lat] as [number, number], to: [B.lng, B.lat] as [number, number] });
    }
    return out;
  }, [flightRoutes, byIdAll]);
  const flightCityIds = useMemo(() => {
    const s = new Set<number>();
    for (const r of flightRoutes) { s.add(r.a); s.add(r.b); }
    return [...s];
  }, [flightRoutes]);

  // "飞过即去过": flight endpoint cities count as visited too. Display-only union
  // (the saved list stays as-is) so arc endpoints always have a city marker
  // without destructively rewriting the user's curated map.
  const effectiveIds = useMemo(() => {
    if (!flightCityIds.length) return ids;
    const have = new Set(ids);
    const extra = flightCityIds.filter((id) => !have.has(id));
    return extra.length ? [...ids, ...extra] : ids;
  }, [ids, flightCityIds]);
  const flightArcs = useMemo(() => arcsFC(resolvedRoutes), [resolvedRoutes]);
  const flightNodes = useMemo(() => nodesFC(resolvedRoutes), [resolvedRoutes]);

  const selectedSet = useMemo(() => new Set(effectiveIds), [effectiveIds]);
  const selected = useMemo<City[]>(
    () => (data ? (effectiveIds.map((id) => byIdAll.get(id)).filter(Boolean) as City[]) : []),
    [effectiveIds, data, byIdAll]
  );
  const stats = useMemo(() => computeStats(selected), [selected]);
  const newestId = ids.length ? ids[ids.length - 1] : undefined;

  const [focusCc, setFocusCc] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showRoutes, setShowRoutes] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  // ── draggable sidebar/map split (md+) ──────────────────────────────────
  const [sidebarW, setSidebarW] = useState(() => {
    const v = Number(localStorage.getItem('sidebarW.v1'));
    return v >= 300 && v <= 760 ? v : 380;
  });
  const sidebarWRef = useRef(sidebarW);
  const drag = useRef<{ startX: number; startW: number } | null>(null);
  useEffect(() => {
    localStorage.setItem('sidebarW.v1', String(sidebarW));
  }, [sidebarW]);
  const onDragMove = useCallback((e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const w = Math.max(300, Math.min(d.startW + (e.clientX - d.startX), window.innerWidth - 420));
    sidebarWRef.current = w;
    setSidebarW(w);
  }, []);
  const onDragEnd = useCallback(() => {
    drag.current = null;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, [onDragMove]);
  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      drag.current = { startX: e.clientX, startW: sidebarWRef.current };
      window.addEventListener('pointermove', onDragMove);
      window.addEventListener('pointerup', onDragEnd);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    },
    [onDragMove, onDragEnd]
  );

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
        {t('app.loadError', error)}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-muted">{t('app.loading')}</div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-[1400px] flex-col gap-4 p-4 md:p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="Life Map" className="h-10 w-10 shrink-0" />
          <div>
            <h1 className="font-display text-3xl text-ink">{t('app.title')}</h1>
            <p className="mt-0.5 text-sm text-muted">{t('app.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <UserMenu />
          <LangSwitcher />
          <ThemeSwitcher value={themeName} onChange={setThemeName} />
          <button
            onClick={() => setShowRoutes(true)}
            className="rounded-full border border-land-border px-4 py-1.5 text-sm text-ink hover:border-accent"
          >
            ✈ {t('app.routes')}
          </button>
          <button
            onClick={onShare}
            disabled={selected.length === 0}
            className="rounded-full border border-land-border px-4 py-1.5 text-sm text-ink hover:border-accent disabled:opacity-40"
          >
            {t('app.share')}
          </button>
          <button
            onClick={() => setShowExport(true)}
            disabled={selected.length === 0}
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {t('app.export')}
          </button>
        </div>
      </header>

      {shareUrl && (
        <div className="flex items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft/30 px-4 py-2 text-sm">
          <span className="text-muted">{t('app.linkCopied')}</span>
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

      <main
        className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[var(--sidebar-w)_auto_1fr] md:gap-0"
        style={{ '--sidebar-w': `${sidebarW}px` } as React.CSSProperties}
      >
        <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto rounded-2xl border border-land-border bg-bg/40 p-4">
          <SearchBox data={data} selected={selectedSet} onAdd={add} />
          <RecommendationChips data={data} ids={effectiveIds} onAdd={add} focusCc={focusCc} />
          <SmartExpand data={data} ids={effectiveIds} newestId={newestId} onAdd={add} />
          <SelectedCities cities={[...selected].reverse()} onRemove={remove} onClear={clear} />
        </aside>

        {/* draggable divider (desktop only) */}
        <div
          role="separator"
          aria-orientation="vertical"
          title="拖拽调整宽度"
          onPointerDown={onDragStart}
          onDoubleClick={() => setSidebarW(380)}
          className="group hidden cursor-col-resize touch-none items-center justify-center px-2 md:flex"
        >
          <div className="h-12 w-1 rounded-full bg-land-border transition-colors group-hover:bg-accent" />
        </div>

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
            flightArcs={flightArcs}
            flightNodes={flightNodes}
          />
        </section>
      </main>

      {showExport && (
        <ExportPanel
          cities={selected}
          stats={stats}
          theme={theme}
          flightArcs={flightArcs}
          flightNodes={flightNodes}
          onClose={() => setShowExport(false)}
        />
      )}

      {showRoutes && (
        <RoutesPanel
          data={data}
          byId={byIdAll}
          routes={flightRoutes}
          onAdd={addRoute}
          onRemove={removeRoute}
          onSetCount={setRouteCount}
          onImport={upsertRoutes}
          onClose={() => setShowRoutes(false)}
        />
      )}
    </div>
  );
}
