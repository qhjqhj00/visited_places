import { useEffect, useMemo, useRef, useState } from 'react';
import { useCityData } from './hooks/useCityData';
import { useVisited } from './hooks/useVisited';
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

  const selectedSet = useMemo(() => new Set(ids), [ids]);
  const selected = useMemo<City[]>(
    () => (data ? (ids.map((id) => data.byId.get(id)).filter(Boolean) as City[]) : []),
    [ids, data]
  );
  const stats = useMemo(() => computeStats(selected), [selected]);
  const newestId = ids.length ? ids[ids.length - 1] : undefined;

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
          <RecommendationChips data={data} ids={ids} onAdd={add} />
          <SmartExpand data={data} ids={ids} newestId={newestId} onAdd={add} />
          <SelectedCities cities={[...selected].reverse()} onRemove={remove} onClear={clear} />
        </aside>

        <section className="relative min-h-[320px] overflow-hidden rounded-2xl border border-land-border bg-surface">
          <div className="absolute left-4 top-4 z-10">
            <StatsBar stats={stats} />
          </div>
          <MapView cities={selected} theme={theme} />
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
