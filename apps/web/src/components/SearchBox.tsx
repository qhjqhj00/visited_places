import { useMemo, useRef, useState } from 'react';
import type { CityData } from '../hooks/useCityData';
import type { City } from '../types';

interface Props {
  data: CityData;
  selected: Set<number>;
  onAdd: (id: number) => void;
}

export default function SearchBox({ data, selected, onAdd }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo<City[]>(() => {
    const q = query.trim();
    if (!q) return [];
    const ql = q.toLowerCase();
    const hits = data.mini
      .search(q, { prefix: true, fuzzy: 0.2, combineWith: 'AND' })
      .slice(0, 60)
      .map((r) => data.byId.get(r.id as number))
      .filter((c): c is City => !!c && !selected.has(c.id));
    const startsWith = (c: City) =>
      c.en.toLowerCase().startsWith(ql) || (c.zh ?? '').startsWith(q);
    return hits
      .sort((a, b) => {
        const s = (startsWith(b) ? 1 : 0) - (startsWith(a) ? 1 : 0);
        return s !== 0 ? s : b.prom - a.prom;
      })
      .slice(0, 8);
  }, [query, data, selected]);

  const choose = (c: City) => {
    onAdd(c.id);
    setQuery('');
    setActive(0);
    inputRef.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && results[active]) {
      choose(results[active]);
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-2xl border border-land-border bg-surface px-4 py-3 shadow-soft">
        <span className="text-muted">🔍</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKey}
          placeholder="搜索城市，中英文都行 — 试试「札幌」或「Suzhou」"
          className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-muted/70"
          autoFocus
        />
      </div>

      {results.length > 0 && (
        <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-land-border bg-surface shadow-soft">
          {results.map((c, i) => (
            <li key={c.id}>
              <button
                data-testid="search-result"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(c);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left ${
                  i === active ? 'bg-accent-soft/40' : ''
                }`}
              >
                <span className="flex items-baseline gap-2">
                  <span className="text-[15px] text-ink">{c.zh || c.en}</span>
                  {c.zh && <span className="text-xs text-muted">{c.en}</span>}
                </span>
                <span className="text-xs text-muted">{c.country}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
