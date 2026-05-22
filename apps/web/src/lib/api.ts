export interface ExpandCity {
  id: number;
  en: string;
  zh: string | null;
  country: string;
  lat: number;
  lng: number;
  prom: number;
}

const UID_KEY = 'uid.v1';

function genId(): string {
  // crypto.randomUUID exists only in secure contexts (https/localhost); on a
  // plain-http LAN IP it's undefined, so fall back to a non-crypto id.
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Stable anonymous device id (real auth slots in here later). */
export function getUserId(): string {
  let id = localStorage.getItem(UID_KEY);
  if (!id) {
    id = genId();
    localStorage.setItem(UID_KEY, id);
  }
  return id;
}

async function json<T>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

const jsonHeaders = { 'content-type': 'application/json' };

export const api = {
  loadMap: () =>
    json<{ ids: number[] }>('/api/map', { headers: { 'x-user-id': getUserId() } }).then(
      (d) => d.ids
    ),

  saveMap: (ids: number[]) =>
    fetch('/api/map', {
      method: 'PUT',
      headers: { ...jsonHeaders, 'x-user-id': getUserId() },
      body: JSON.stringify({ ids }),
    }),

  share: (ids: number[]) =>
    json<{ code: string }>('/api/share', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ ids }),
    }).then((d) => d.code),

  loadShare: (code: string) =>
    json<{ ids: number[] }>(`/api/share/${code}`).then((d) => d.ids),

  expand: (anchorId: number, exclude: number[]) =>
    json<{ cities: ExpandCity[]; cached: boolean }>('/api/expand', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ anchorId, exclude }),
    }).then((d) => d.cities),
};
