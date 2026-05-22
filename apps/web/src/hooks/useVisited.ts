import { useCallback, useEffect, useState } from 'react';

const KEY = 'visited.v1';

/** Ordered list of selected city ids (insertion order = recency), persisted. */
export function useVisited() {
  const [ids, setIds] = useState<number[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(raw) ? (raw as number[]) : [];
    } catch {
      return [];
    }
  });

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
