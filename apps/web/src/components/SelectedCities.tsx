import type { City } from '../types';

interface Props {
  cities: City[]; // newest first
  onRemove: (id: number) => void;
  onClear: () => void;
}

export default function SelectedCities({ cities, onRemove, onClear }: Props) {
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
          去过的城市 · {cities.length}
        </span>
        <button
          onClick={onClear}
          className="text-xs text-muted hover:text-accent"
        >
          清空
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {cities.map((c) => (
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
  );
}
