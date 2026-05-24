import { useMemo } from 'react';
import type { City } from '../types';

interface Props {
  cities: City[]; // newest first
  onRemove: (id: number) => void;
  onClear: () => void;
}

// 2-letter country code → flag emoji (regional indicator symbols)
const flag = (cc: string): string =>
  /^[A-Za-z]{2}$/.test(cc)
    ? String.fromCodePoint(...[...cc.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65))
    : '🏳️';

export default function SelectedCities({ cities, onRemove, onClear }: Props) {
  // Group by country. Iterating newest-first means a country's first-seen city is
  // its newest, so Map insertion order = countries by most-recent activity, and
  // each group's list stays newest-first.
  const groups = useMemo(() => {
    const m = new Map<string, { country: string; cc: string; list: City[] }>();
    for (const c of cities) {
      const key = c.country || c.cc || '—';
      const g = m.get(key);
      if (g) g.list.push(c);
      else m.set(key, { country: c.country || c.cc, cc: c.cc, list: [c] });
    }
    return [...m.values()];
  }, [cities]);

  if (cities.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-land-border px-4 py-6 text-center text-sm text-muted">
        还没有去过的城市。<br />搜索或点上面的推荐开始吧 ✨
      </p>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted">
          去过的城市 · {cities.length} · {groups.length} 国
        </span>
        <button onClick={onClear} className="text-xs text-muted hover:text-accent">
          清空
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {groups.map((g) => (
          <div key={g.country} data-testid="country-group">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink/80">
              <span>{flag(g.cc)}</span>
              <span>{g.country}</span>
              <span className="text-muted">· {g.list.length}</span>
            </div>
            <div className="flex flex-wrap gap-2 border-l border-land-border/60 pl-2.5">
              {g.list.map((c) => (
                <span
                  key={c.id}
                  data-testid="selected-pill"
                  className="chip group flex items-center gap-1.5 rounded-full bg-accent-soft/40 px-3 py-1.5 text-sm text-ink"
                >
                  <span>{c.zh || c.en}</span>
                  <button
                    onClick={() => onRemove(c.id)}
                    className="text-muted hover:text-accent"
                    title="移除"
                    aria-label={`移除 ${c.en}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
