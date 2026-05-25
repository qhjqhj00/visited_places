import { useState } from 'react';
import { api, type ExpandCity } from '../lib/api';
import type { CityData } from '../hooks/useCityData';
import { useT, cityName } from '../lib/i18n';

interface Props {
  data: CityData;
  ids: number[];
  newestId?: number;
  onAdd: (id: number) => void;
}

export default function SmartExpand({ data, ids, newestId, onAdd }: Props) {
  const { t, lang } = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ExpandCity[] | null>(null);
  const [anchorName, setAnchorName] = useState('');

  if (newestId === undefined) return null;
  const anchor = data.byId.get(newestId);

  const run = async () => {
    setLoading(true);
    setError(null);
    setAnchorName(anchor ? cityName(anchor, lang) : '');
    try {
      setResults(await api.expand(newestId, ids));
    } catch {
      setError(t('expand.busy'));
    } finally {
      setLoading(false);
    }
  };

  const visible = (results ?? []).filter((c) => !ids.includes(c.id));

  return (
    <div>
      <button
        onClick={run}
        disabled={loading}
        className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft/30 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent-soft/60 disabled:opacity-60"
      >
        <span>✨</span>
        {loading ? t('expand.loading') : t('expand.cta')}
      </button>

      {error && (
        <p className="mt-2 cursor-pointer text-xs text-accent" onClick={run}>
          {error}
        </p>
      )}

      {visible.length > 0 && (
        <div className="mt-2.5">
          <div className="mb-1.5 text-xs text-muted">
            <span className="text-accent">✨</span> {t('expand.based', anchorName)}
          </div>
          <div className="flex flex-wrap gap-2">
            {visible.map((c) => (
              <button
                key={c.id}
                onClick={() => onAdd(c.id)}
                className="chip flex items-center gap-1.5 rounded-full border border-accent/30 bg-surface px-3 py-1.5 text-sm text-ink hover:bg-accent-soft/40"
                title={`${cityName(c, lang)} · ${c.country}`}
              >
                <span>{cityName(c, lang)}</span>
                <span className="text-accent opacity-60">+</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
