import { useEffect, useState } from 'react';
import { ASPECTS, renderPoster, type AspectKey } from '../lib/exportMap';
import type { FlightMode } from '../lib/mapStyle';
import { downloadBlob } from '../lib/exportImage';
import type { Stats } from '../lib/stats';
import type { Theme } from '../theme';
import type { City } from '../types';
import { useT } from '../lib/i18n';

interface Props {
  cities: City[];
  stats: Stats;
  theme: Theme;
  flightArcs?: any;
  flightNodes?: any;
  onClose: () => void;
}

export default function ExportPanel({ cities, stats, theme, flightArcs, flightNodes, onClose }: Props) {
  const { t, lang } = useT();
  const hasFlights = (flightArcs?.features?.length ?? 0) > 0;
  const [aspect, setAspect] = useState<AspectKey>('square');
  const [mode, setMode] = useState<FlightMode>(hasFlights ? 'both' : 'cities');
  const [title, setTitle] = useState(() => t('app.title'));
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [preview, setPreview] = useState<{ url: string; blob: Blob } | null>(null);

  // any input change invalidates the rendered preview
  useEffect(() => {
    setPreview((p) => {
      if (p) URL.revokeObjectURL(p.url);
      return null;
    });
    setError(false);
  }, [aspect, mode, title, handle, theme, cities, lang]);

  // revoke on unmount
  useEffect(() => () => setPreview((p) => (p && URL.revokeObjectURL(p.url), null)), []);

  const generate = async () => {
    setBusy(true);
    setError(false);
    try {
      const blob = await renderPoster({ cities, stats, theme, title, handle, aspect, lang, mode, flightArcs, flightNodes });
      setPreview({ url: URL.createObjectURL(blob), blob });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-4 overflow-y-auto rounded-2xl border border-land-border bg-surface p-5 shadow-soft md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-1 items-center justify-center rounded-xl border border-land-border bg-bg/40 p-3">
          {preview ? (
            <img src={preview.url} alt={t('export.preview')} className="max-h-[60vh] w-auto rounded" />
          ) : (
            <div className="px-6 py-16 text-center text-sm text-muted">
              {busy ? t('export.rendering') : error ? t('export.renderFail') : t('export.hint')}
            </div>
          )}
        </div>

        <div className="flex w-full shrink-0 flex-col gap-4 md:w-60">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-ink">{t('export.title')}</h2>
            <button onClick={onClose} className="text-muted hover:text-accent" aria-label={t('common.close')}>
              ×
            </button>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-muted">{t('export.size')}</label>
            <div className="flex gap-1 rounded-full border border-land-border p-1">
              {(Object.keys(ASPECTS) as AspectKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setAspect(k)}
                  className={`flex-1 rounded-full px-2 py-1 text-xs transition-colors ${
                    aspect === k ? 'bg-accent text-white' : 'text-muted hover:text-ink'
                  }`}
                >
                  {ASPECTS[k].ratio} {t(`aspect.${k}`)}
                </button>
              ))}
            </div>
          </div>

          {hasFlights && (
            <div>
              <label className="mb-1.5 block text-xs text-muted">{t('export.content')}</label>
              <div className="flex gap-1 rounded-full border border-land-border p-1">
                {(['both', 'cities', 'routes'] as FlightMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`flex-1 rounded-full px-2 py-1 text-xs transition-colors ${
                      mode === m ? 'bg-accent text-white' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {t(`flight.${m}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs text-muted">{t('export.titleLabel')}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-land-border bg-bg/40 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-muted">{t('export.handle')}</label>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@yourname"
              className="w-full rounded-xl border border-land-border bg-bg/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted/60 focus:border-accent"
            />
          </div>

          <div className="mt-auto flex flex-col gap-2">
            {!preview ? (
              <button
                onClick={generate}
                disabled={busy}
                className="rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? t('export.renderingShort') : t('export.generate')}
              </button>
            ) : (
              <button
                onClick={() => downloadBlob(preview.blob, `my-world-${aspect}.png`)}
                className="rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-white"
              >
                {t('export.download')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
