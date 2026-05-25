import type { Stats } from '../lib/stats';
import { useT } from '../lib/i18n';

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-display text-2xl leading-none text-ink">{value}</span>
      <span className="mt-1 text-xs text-muted">{label}</span>
    </div>
  );
}

export default function StatsBar({ stats }: { stats: Stats }) {
  const { t } = useT();
  return (
    <div className="flex gap-6 rounded-2xl border border-land-border bg-surface/80 px-5 py-3 shadow-soft backdrop-blur">
      <Stat value={String(stats.cities)} label={t('stats.cities')} />
      <Stat value={String(stats.countries)} label={t('stats.countries')} />
      <Stat value={String(stats.continents)} label={t('stats.continents')} />
      <Stat value={`${stats.worldPct}%`} label={t('stats.world')} />
    </div>
  );
}
