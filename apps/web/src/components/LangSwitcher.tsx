import { useT, type Lang } from '../lib/i18n';

const OPTIONS: { lang: Lang; label: string }[] = [
  { lang: 'zh', label: '中' },
  { lang: 'en', label: 'EN' },
];

export default function LangSwitcher() {
  const { lang, setLang } = useT();
  return (
    <div className="flex gap-1 rounded-full border border-land-border bg-surface p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.lang}
          onClick={() => setLang(o.lang)}
          className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
            lang === o.lang ? 'bg-accent text-white' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
