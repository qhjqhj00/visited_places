import { useCallback, useEffect, useState } from 'react';
import { getUserId } from '../lib/api';

// Per-user cache key so switching users doesn't bleed one map into another, and a
// fresh browser (empty key) falls back to the server copy for that user.
const uid = getUserId();
const KEY = `visited.v1:${uid}`;
const LEGACY_KEY = 'visited.v1'; // pre-multi-user global cache (only valid for "0")

function initialIds(): number[] {
  try {
    let raw = localStorage.getItem(KEY);
    // one-time: adopt the old global cache for the default user
    if (raw === null && uid === '0') {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy !== null) {
        localStorage.setItem(KEY, legacy);
        localStorage.removeItem(LEGACY_KEY);
        raw = legacy;
      }
    }
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? (parsed as number[]) : [];
  } catch {
    return [];
  }
}

/** Ordered list of selected city ids (insertion order = recency), persisted. */
export function useVisited() {
  const [ids, setIds] = useState<number[]>(initialIds);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(ids));
  }, [ids]);

  const add = useCallback(
    (id: number) => setIds((prev) => (prev.includes(id) ? prev : [...prev, id])),
    []
  );
  const remove = useCallback(
    (id: number) => setIds((prev) => prev.filter((x) => x !== id)),
    []
  );
  const clear = useCallback(() => setIds([]), []);
  const replace = useCallback((next: number[]) => setIds(next), []);

  return { ids, add, remove, clear, replace };
}
