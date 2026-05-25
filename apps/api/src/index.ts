import './env';
import crypto from 'node:crypto';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { store, initStore } from './store';
import { byId, resolveCity } from './cities';
import { expandCities } from './minimax';

const app = new Hono();

// CORS: lock to CORS_ORIGINS in production; reflect any origin in dev (unset).
const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use('/api/*', cors(corsOrigins.length ? { origin: corsOrigins } : {}));

// Reject oversized payloads early (defense-in-depth with the per-handler caps).
const MAX_BODY = 4 * 1024 * 1024;
app.use('/api/*', async (c, next) => {
  if (Number(c.req.header('content-length') || 0) > MAX_BODY)
    return c.json({ error: 'payload too large' }, 413);
  await next();
});

// Tiny in-memory sliding-window rate limiter (per client IP) — no dependency.
function rateLimit(windowMs: number, max: number) {
  const hits = new Map<string, number[]>();
  return async (c: any, next: any) => {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
      c.req.header('x-real-ip') ||
      'local';
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return c.json({ error: 'rate limited, slow down' }, 429);
    arr.push(now);
    hits.set(ip, arr);
    if (hits.size > 10000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    await next();
  };
}
app.use('/api/*', rateLimit(60_000, 600)); // generous global
app.use('/api/expand', rateLimit(60_000, 20)); // strict: the LLM lane costs money

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
  const ids = (body.ids ?? []).filter((x: unknown) => Number.isInteger(x)).slice(0, 100_000);
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
  const places = (Array.isArray(body.places) ? body.places : [])
    .filter((p: any) => p && typeof p.id === 'number' && typeof p.lat === 'number' && typeof p.lng === 'number')
    .slice(0, 50_000);
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
    .map((r: any) => ({ a: r.a, b: r.b, n: Number.isFinite(r.n) && r.n > 0 ? Math.floor(r.n) : 1 }))
    .slice(0, 50_000);
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
    if (!process.env.MINIMAX_API_KEY)
      return c.json({ error: 'smart expand disabled (no MINIMAX_API_KEY configured)' }, 503);
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

// Production / Docker: serve the built web app from this same server. Set
// SERVE_STATIC to the dist dir (relative to cwd), e.g. "apps/web/dist". In dev
// the web is served by Vite, so this stays unset.
if (process.env.SERVE_STATIC) {
  const root = process.env.SERVE_STATIC;
  app.use('/*', serveStatic({ root }));
  app.get('*', serveStatic({ path: `${root}/index.html` })); // SPA fallback
}

const port = Number(process.env.PORT) || 3001;
const hostname = process.env.HOST || '0.0.0.0';
initStore().then(() => {
  serve({ fetch: app.fetch, port, hostname });
  console.log(`api listening on http://${hostname}:${port} (${byId.size} cities loaded)`);
});
