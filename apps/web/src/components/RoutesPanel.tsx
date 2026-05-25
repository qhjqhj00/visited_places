import { useMemo, useRef, useState } from 'react';
import type { CityData } from '../hooks/useCityData';
import type { FlightRoute } from '../hooks/useFlights';
import type { City } from '../types';
import { useT, cityName } from '../lib/i18n';
import { countryName } from '../lib/countries';
import { importVariflight } from '../lib/importVariflight';

interface PickerProps {
  data: CityData;
  value: number | null;
  onPick: (id: number | null) => void;
  placeholder: string;
}

/** Compact city search → id picker (reuses the MiniSearch index). */
function CityPicker({ data, value, onPick, placeholder }: PickerProps) {
  const { lang } = useT();
  const [q, setQ] = useState('');
  const sel = value != null ? data.byId.get(value) : undefined;

  const results = useMemo<City[]>(() => {
    const s = q.trim();
    if (!s) return [];
    return data.mini
      .search(s, { prefix: true, fuzzy: 0.2 })
      .slice(0, 20)
      .map((r) => data.byId.get(r.id as number))
      .filter((c): c is City => !!c)
      .slice(0, 6);
  }, [q, data]);

  if (sel) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-land-border bg-bg/40 px-2.5 py-1.5 text-sm text-ink">
        <span className="truncate">{cityName(sel, lang)}</span>
        <button onClick={() => onPick(null)} className="ml-1 shrink-0 text-muted hover:text-accent">
          ×
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-land-border bg-bg/40 px-2.5 py-1.5 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-accent"
      />
      {results.length > 0 && (
        <ul className="absolute z-40 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-land-border bg-surface shadow-soft">
          {results.map((c) => (
            <li key={c.id}>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(c.id);
                  setQ('');
                }}
                className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-sm hover:bg-accent-soft/40"
              >
                <span className="truncate text-ink">{cityName(c, lang)}</span>
                <span className="ml-2 shrink-0 text-xs text-muted">
                  {countryName(c.cc, c.country, lang)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Props {
  data: CityData;
  byId: Map<number, City>;
  routes: FlightRoute[];
  onAdd: (a: number, b: number, n: number) => void;
  onRemove: (a: number, b: number) => void;
  onSetCount: (a: number, b: number, n: number) => void;
  onImport: (routes: FlightRoute[]) => void;
  onClose: () => void;
}

export default function RoutesPanel({ data, byId, routes, onAdd, onRemove, onSetCount, onImport, onClose }: Props) {
  const { t, lang } = useT();
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [times, setTimes] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setImporting(true);
    setStatus(null);
    try {
      const res = await importVariflight(f, data);
      onImport(res.routes);
      setStatus(t('routes.imported', res.routes.length, res.unresolved.length));
    } catch {
      setStatus(t('routes.importFail'));
    } finally {
      setImporting(false);
    }
  };

  const sorted = useMemo(() => [...routes].sort((a, b) => b.n - a.n), [routes]);
  const name = (id: number) => {
    const c = byId.get(id);
    return c ? cityName(c, lang) : `#${id}`;
  };
  const canAdd = from != null && to != null && from !== to;
  const add = () => {
    if (!canAdd) return;
    onAdd(from!, to!, Math.max(1, Math.floor(times) || 1));
    setFrom(null);
    setTo(null);
    setTimes(1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-land-border bg-surface p-5 shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg text-ink">
            {t('routes.title')} <span className="text-sm text-muted">· {t('routes.count', routes.length)}</span>
          </h2>
          <button onClick={onClose} className="text-muted hover:text-accent" aria-label={t('common.close')}>
            ×
          </button>
        </div>

        {/* import from 航旅纵横 */}
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="shrink-0 rounded-lg border border-land-border px-3 py-1.5 text-sm text-ink hover:border-accent disabled:opacity-50"
          >
            📤 {importing ? t('routes.importing') : t('routes.import')}
          </button>
          <input ref={fileRef} type="file" accept=".xls,.xlsx" onChange={onFile} className="hidden" />
          <span
            className={`min-w-0 truncate text-xs ${status ? 'text-accent' : 'text-muted'}`}
            title={status || t('routes.importHint')}
          >
            {status || t('routes.importHint')}
          </span>
        </div>

        {/* add form */}
        <div className="grid grid-cols-[1fr_auto_1fr_auto_auto] items-center gap-2 rounded-xl border border-land-border bg-bg/30 p-2.5">
          <CityPicker data={data} value={from} onPick={setFrom} placeholder={t('routes.from')} />
          <span className="text-muted">→</span>
          <CityPicker data={data} value={to} onPick={setTo} placeholder={t('routes.to')} />
          <input
            type="number"
            min={1}
            value={times}
            onChange={(e) => setTimes(Number(e.target.value))}
            title={t('routes.times')}
            className="w-14 rounded-lg border border-land-border bg-bg/40 px-2 py-1.5 text-center text-sm text-ink outline-none focus:border-accent"
          />
          <button
            onClick={add}
            disabled={!canAdd}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {t('routes.addBtn')}
          </button>
        </div>

        {/* list */}
        <div className="mt-3 flex-1 overflow-y-auto">
          {sorted.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">{t('routes.empty')}</p>
          ) : (
            <div className="flex flex-col gap-1">
              {sorted.map((r) => (
                <div
                  key={`${r.a}-${r.b}`}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-accent-soft/20"
                >
                  <span className="min-w-0 truncate text-ink">
                    {name(r.a)} <span className="text-muted">→</span> {name(r.b)}
                  </span>
                  <div className="ml-2 flex shrink-0 items-center gap-1.5">
                    <span className="text-xs text-muted">×</span>
                    <input
                      type="number"
                      min={1}
                      value={r.n}
                      onChange={(e) => onSetCount(r.a, r.b, Number(e.target.value))}
                      className="w-12 rounded-md border border-land-border bg-bg/40 px-1.5 py-1 text-center text-xs text-ink outline-none focus:border-accent"
                    />
                    <button
                      onClick={() => onRemove(r.a, r.b)}
                      title={t('common.remove')}
                      className="rounded-md px-1.5 py-1 text-muted hover:bg-accent-soft/40 hover:text-accent"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
