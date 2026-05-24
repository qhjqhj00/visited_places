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

/** Until login exists, everyone shares one fixed server bucket, userid "0".
 * Real auth slots in here later (return the signed-in user id). */
export function getUserId(): string {
  return '0';
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
