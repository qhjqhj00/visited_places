# Contributing to LifeMap

Thanks for your interest! Issues and PRs are welcome.

## Setup

Requires **Node ≥ 18** (and **Python 3** only if you rebuild the data).

```bash
npm install
npm run dev:api    # API on :3001
npm run dev        # web on :5173 (proxies /api → 3001)
```

The bundled datasets are committed, so it runs out of the box.

## Before you open a PR

Please make sure these pass (CI runs them on Node 18 & 20):

```bash
npm run lint
npm run typecheck
npm run test       # Vitest unit tests
npm run build
npm run e2e        # Playwright smoke (optional locally)
```

- **Style:** ESLint (flat config) + Prettier are configured; match the surrounding code.
- **Tests:** add/extend tests under `apps/web/src/**/*.test.ts` (Vitest) or `tests/e2e/` (Playwright) where it makes sense.
- **Commits:** small, focused, conventional-ish messages (`feat:`, `fix:`, `docs:`, `chore:`). Branch off `main` and open a PR.

## Project layout

```
apps/web/   React + Vite + Tailwind (components/, hooks/, lib/, public/data/)
apps/api/   Hono API + sql.js store
tools/      Python data builders (build_data.py, build_flights.py)
```

See the [README](README.md) for the architecture overview and data pipeline.

## Data changes

`apps/web/public/data/*.json` is generated. If you change the pipeline, regenerate
with `npm run data` / `npm run flights` and commit the result. Don't commit
`flight.xls`/`flight.jpg` (git-ignored — they contain personal data).

By contributing you agree your contributions are licensed under [Apache-2.0](LICENSE).
