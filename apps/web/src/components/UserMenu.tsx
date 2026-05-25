import { useEffect, useRef, useState } from 'react';
import { api, getUserId, sanitizeUserId, setUserId } from '../lib/api';
import { useT } from '../lib/i18n';

/** Username-only user picker: the name IS the server bucket key. Switching writes
 * the choice to localStorage and reloads so every hook re-reads it. No password —
 * data follows whoever types the same name (see project decision: login deferred). */
export default function UserMenu() {
  const { t } = useT();
  const labelOf = (uid: string) => (uid === '0' ? t('user.default') : uid);
  const current = getUserId();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<{ uid: string; count: number }[]>([]);
  const [name, setName] = useState('');
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    api.listUsers().then(setUsers).catch(() => {});
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const switchTo = (uid: string) => {
    if (uid && uid !== current) {
      setUserId(uid);
      location.reload();
    } else {
      setOpen(false);
    }
  };

  const createOrEnter = () => {
    const clean = sanitizeUserId(name);
    if (clean) switchTo(clean);
  };

  // Claim the current bucket under a new name (moves map + custom places server-side).
  const rename = async () => {
    const clean = sanitizeUserId(name);
    if (!clean || clean === current) return;
    await api.renameUser(current, clean).catch(() => {});
    switchTo(clean);
  };

  const others = users.filter((u) => u.uid !== current);

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-land-border bg-surface px-3 py-1.5 text-sm text-ink hover:border-accent"
      >
        <span>👤</span>
        <span className="max-w-[8rem] truncate">{labelOf(current)}</span>
        <span className="text-xs text-muted">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-60 rounded-xl border border-land-border bg-surface p-2 text-sm shadow-lg">
          <div className="px-2 pb-1.5 text-xs text-muted">
            {t('user.current')} · <span className="text-ink">{labelOf(current)}</span>
          </div>

          {others.length > 0 && (
            <div className="max-h-44 overflow-y-auto border-t border-land-border pt-1.5">
              {others.map((u) => (
                <button
                  key={u.uid}
                  onClick={() => switchTo(u.uid)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-ink hover:bg-accent-soft/40"
                >
                  <span className="truncate">{labelOf(u.uid)}</span>
                  <span className="ml-2 shrink-0 text-xs text-muted">{t('user.cities', u.count)}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-1.5 flex gap-1.5 border-t border-land-border pt-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createOrEnter()}
              placeholder={t('user.placeholder')}
              maxLength={24}
              className="min-w-0 flex-1 rounded-lg border border-land-border bg-bg/40 px-2 py-1.5 text-ink outline-none focus:border-accent"
            />
            <button
              onClick={createOrEnter}
              disabled={!sanitizeUserId(name)}
              className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              {t('user.enter')}
            </button>
          </div>

          <button
            onClick={rename}
            disabled={!sanitizeUserId(name) || sanitizeUserId(name) === current}
            className="mt-1.5 w-full rounded-lg px-2 py-1 text-left text-xs text-muted hover:text-accent disabled:opacity-40"
            title={t('user.renameTitle')}
          >
            {t('user.rename', labelOf(current))}
          </button>
        </div>
      )}
    </div>
  );
}
