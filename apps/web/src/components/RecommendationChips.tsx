import { useEffect, useMemo, useState } from 'react';
import type { CityData } from '../hooks/useCityData';
import { recommend, recommendInCountry, starters } from '../lib/recommend';

interface Props {
  data: CityData;
  ids: number[];
  onAdd: (id: number) => void;
  /** When set, chips are scoped to this country (map drilled into it). */
  focusCc?: string | null;
}

export default function RecommendationChips({ data, ids, onAdd, focusCc }: Props) {
  const seeds = useMemo(() => starters(data, 18), [data]);

  // re-roll the random country picks each time you open a (different) country
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  useEffect(() => {
    if (focusCc) setSeed(Math.floor(Math.random() * 1e9));
  }, [focusCc]);

  const excludeSet = useMemo(() => new Set(ids), [ids]);
  const recs = useMemo(() => {
    if (focusCc) return recommendInCountry(data, focusCc, 30, seed, excludeSet);
    return ids.length ? recommend(ids, data, 18) : seeds;
  }, [data, focusCc, seed, excludeSet, ids, seeds]);

  const countryName = useMemo(
    () => (focusCc ? data.all.find((c) => c.cc === focusCc)?.country ?? '' : ''),
    [focusCc, data]
  );

  if (recs.length === 0) return null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
        {focusCc ? (
          <>
            <span className="text-accent">📍</span>
            {countryName ? `${countryName} · ` : ''}热门城市
            <button
              onClick={() => setSeed(Math.floor(Math.random() * 1e9))}
              className="ml-auto rounded-full border border-land-border px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent"
            >
              🎲 换一批
            </button>
          </>
        ) : ids.length ? (
          <>
            <span className="text-accent">⚡</span> 你可能也去过 · 点一下快速添加
          </>
        ) : (
          <>
            <span className="text-accent">✨</span> 从这些热门城市开始
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {recs.map((c) => (
          <button
            key={c.id}
            data-testid="rec-chip"
            onClick={() => onAdd(c.id)}
            className="chip group flex items-center gap-1.5 rounded-full border border-land-border bg-surface px-3 py-1.5 text-sm text-ink hover:border-accent hover:bg-accent-soft/30"
            title={`${c.en} · ${c.country}`}
          >
            <span>{c.zh || c.en}</span>
            <span className="text-accent opacity-60 group-hover:opacity-100">+</span>
          </button>
        ))}
      </div>
    </div>
  );
}
