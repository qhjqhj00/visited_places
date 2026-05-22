import { useMemo } from 'react';
import type { CityData } from '../hooks/useCityData';
import { recommend, starters } from '../lib/recommend';

interface Props {
  data: CityData;
  ids: number[];
  onAdd: (id: number) => void;
}

export default function RecommendationChips({ data, ids, onAdd }: Props) {
  const seeds = useMemo(() => starters(data, 12), [data]);
  const recs = useMemo(
    () => (ids.length ? recommend(ids, data, 12) : seeds),
    [ids, data, seeds]
  );

  if (recs.length === 0) return null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
        {ids.length ? (
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
