import type { City } from '../types';

export interface ExpandCity {
  id: number;
  en: string;
  zh: string | null;
  country: string;
  lat: number;
  lng: number;
  prom: number;
}

const UID_KEY = 'userId.v1';

/** Strip a username down to a safe bucket key (mirrors the server's cleanName). */
export function sanitizeUserId(s: string): string {
  return s
    .trim()
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .slice(0, 24);
}

/** Current user = the name picked in the user menu, persisted locally. Defaults
 * to "0" (the legacy seeded bucket) so existing data shows on first load.
 * Username-only for now; real auth would replace the stored value with a token. */
export function getUserId(): string {
  try {
    return localStorage.getItem(UID_KEY) || '0';
  } catch {
    return '0';
  }
}

export function setUserId(id: string): void {
  const clean = sanitizeUserId(id) || '0';
  localStorage.setItem(UID_KEY, clean);
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

  loadPlaces: () =>
    json<{ places: City[] }>('/api/places', { headers: { 'x-user-id': getUserId() } }).then(
      (d) => d.places
    ),

  savePlaces: (places: City[]) =>
    fetch('/api/places', {
      method: 'PUT',
      headers: { ...jsonHeaders, 'x-user-id': getUserId() },
      body: JSON.stringify({ places }),
    }),

  loadFlights: () =>
    json<{ routes: { a: number; b: number; n: number }[] }>('/api/flights', {
      headers: { 'x-user-id': getUserId() },
    }).then((d) => d.routes),

  saveFlights: (routes: { a: number; b: number; n: number }[]) =>
    fetch('/api/flights', {
      method: 'PUT',
      headers: { ...jsonHeaders, 'x-user-id': getUserId() },
      body: JSON.stringify({ routes }),
    }),

  share: (ids: number[]) =>
    json<{ code: string }>('/api/share', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ ids }),
    }).then((d) => d.code),

  loadShare: (code: string) =>
    json<{ ids: number[] }>(`/api/share/${code}`).then((d) => d.ids),

  listUsers: () =>
    json<{ users: { uid: string; count: number }[] }>('/api/users').then((d) => d.users),

  renameUser: (from: string, to: string) =>
    fetch('/api/users/rename', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ from, to }),
    }),

  expand: (anchorId: number, exclude: number[]) =>
    json<{ cities: ExpandCity[]; cached: boolean }>('/api/expand', {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ anchorId, exclude }),
    }).then((d) => d.cities),
};
