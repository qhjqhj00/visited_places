import './env';
import crypto from 'node:crypto';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { store, initStore } from './store';
import { byId, resolveCity } from './cities';
import { expandCities } from './minimax';

const app = new Hono();
app.use('/api/*', cors());

app.get('/api/health', (c) => c.json({ ok: true, cities: byId.size }));

// ── per-user map (anonymous device id via x-user-id header) ──────────────
app.get('/api/map', (c) => {
  const uid = c.req.header('x-user-id');
  return c.json({ ids: uid ? store.getMap(uid) : [] });
});

app.put('/api/map', async (c) => {
  const uid = c.req.header('x-user-id');
  if (!uid) return c.json({ error: 'missing x-user-id' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const ids = (body.ids ?? []).filter((x: unknown) => Number.isInteger(x));
  store.setMap(uid, ids);
  return c.json({ ok: true, count: ids.length });
});

// ── ad-hoc "custom" places picked off the basemap (full objects) ─────────
app.get('/api/places', (c) => {
  const uid = c.req.header('x-user-id');
  return c.json({ places: uid ? store.getPlaces(uid) : [] });
});

app.put('/api/places', async (c) => {
  const uid = c.req.header('x-user-id');
  if (!uid) return c.json({ error: 'missing x-user-id' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const places = (Array.isArray(body.places) ? body.places : []).filter(
    (p: any) => p && typeof p.id === 'number' && typeof p.lat === 'number' && typeof p.lng === 'number'
  );
  store.setPlaces(uid, places);
  return c.json({ ok: true, count: places.length });
});

// ── users (username-only "login"; the name IS the bucket key) ────────────
const cleanName = (s: unknown) =>
  String(s ?? '')
    .trim()
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .slice(0, 24);

app.get('/api/users', (c) => c.json({ users: store.listUsers() }));

app.post('/api/users/rename', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const from = cleanName(body.from);
  const to = cleanName(body.to);
  if (!to) return c.json({ error: 'invalid target name' }, 400);
  store.renameUser(from, to);
  return c.json({ ok: true });
});

// ── flown routes (editable: add/delete/edit) ────────────────────────────
app.get('/api/flights', (c) => {
  const uid = c.req.header('x-user-id');
  return c.json({ routes: uid ? store.getFlights(uid) : [] });
});

app.put('/api/flights', async (c) => {
  const uid = c.req.header('x-user-id');
  if (!uid) return c.json({ error: 'missing x-user-id' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const routes = (Array.isArray(body.routes) ? body.routes : [])
    .filter((r: any) => r && Number.isInteger(r.a) && Number.isInteger(r.b) && r.a !== r.b)
    .map((r: any) => ({ a: r.a, b: r.b, n: Number.isFinite(r.n) && r.n > 0 ? Math.floor(r.n) : 1 }));
  store.setFlights(uid, routes);
  return c.json({ ok: true, count: routes.length });
});

// ── share links ─────────────────────────────────────────────────────────
app.post('/api/share', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ids = (body.ids ?? []).filter((x: unknown) => Number.isInteger(x));
  if (!ids.length) return c.json({ error: 'empty selection' }, 400);
  const code = crypto.randomBytes(5).toString('base64url');
  store.addShare(code, ids);
  return c.json({ code });
});

app.get('/api/share/:code', (c) => {
  const ids = store.getShare(c.req.param('code'));
  if (!ids) return c.json({ error: 'not found' }, 404);
  return c.json({ ids });
});

// ── MiniMax "smart expand", cached by anchor city ───────────────────────
app.post('/api/expand', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const anchorId = Number(body.anchorId);
  const exclude = new Set<number>((body.exclude ?? []).map(Number));
  const anchor = byId.get(anchorId);
  if (!anchor) return c.json({ error: 'unknown anchor city' }, 400);

  let ids = store.getCache(anchorId);
  const cached = ids !== undefined;
  if (ids === undefined) {
    try {
      const recs = await expandCities(
        { en: anchor.en, zh: anchor.zh, country: anchor.country },
        8
      );
      const resolved: number[] = [];
      const seen = new Set<number>([anchorId]);
      for (const r of recs) {
        const city = resolveCity(r.name_en, r.name_zh, r.country);
        if (city && !seen.has(city.id)) {
          seen.add(city.id);
          resolved.push(city.id);
        }
      }
      ids = resolved;
      store.setCache(anchorId, ids);
    } catch (e) {
      return c.json({ error: 'expand failed', detail: String(e) }, 502);
    }
  }

  const cities = ids
    .filter((id) => !exclude.has(id))
    .map((id) => byId.get(id))
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, 8)
    .map((c2) => ({
      id: c2.id,
      en: c2.en,
      zh: c2.zh,
      country: c2.country,
      lat: c2.lat,
      lng: c2.lng,
      prom: c2.prom,
    }));
  return c.json({ cities, cached });
});

const port = Number(process.env.PORT) || 3001;
const hostname = process.env.HOST || '0.0.0.0';
initStore().then(() => {
  serve({ fetch: app.fetch, port, hostname });
  console.log(`api listening on http://${hostname}:${port} (${byId.size} cities loaded)`);
});
