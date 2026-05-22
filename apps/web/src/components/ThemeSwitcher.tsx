import { themes } from '../theme';

interface Props {
  value: string;
  onChange: (name: string) => void;
}

export default function ThemeSwitcher({ value, onChange }: Props) {
  return (
    <div className="flex gap-1 rounded-full border border-land-border bg-surface p-1">
      {Object.values(themes).map((t) => (
        <button
          key={t.name}
          onClick={() => onChange(t.name)}
          className={`rounded-full px-3 py-1 text-xs transition-colors ${
            value === t.name
              ? 'bg-accent text-white'
              : 'text-muted hover:text-ink'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
