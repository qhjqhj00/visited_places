import { themes } from '../theme';
import { useT } from '../lib/i18n';

interface Props {
  value: string;
  onChange: (name: string) => void;
}

export default function ThemeSwitcher({ value, onChange }: Props) {
  const { t } = useT();
  return (
    <div className="flex gap-1 rounded-full border border-land-border bg-surface p-1">
      {Object.values(themes).map((theme) => (
        <button
          key={theme.name}
          onClick={() => onChange(theme.name)}
          className={`rounded-full px-3 py-1 text-xs transition-colors ${
            value === theme.name
              ? 'bg-accent text-white'
              : 'text-muted hover:text-ink'
          }`}
        >
          {t(`theme.${theme.name}`)}
        </button>
      ))}
    </div>
  );
}
