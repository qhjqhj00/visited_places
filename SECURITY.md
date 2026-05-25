# Security Policy

## Reporting a vulnerability

Please report security issues **privately** via GitHub Security Advisories
([Report a vulnerability](https://github.com/qhjqhj00/LifeMap/security/advisories/new)),
not in public issues. We'll acknowledge within a few days.

## Threat model / scope

LifeMap is a personal travel-map app. A few things to be aware of when deploying it publicly:

- **No authentication.** "Users" are just unauthenticated buckets keyed by a name
  (`x-user-id`); anyone who types a name can read/write that bucket. This is fine for
  personal/trusted use — **do not expose it publicly with sensitive data** until real
  auth is added.
- **LLM endpoint costs money.** `/api/expand` calls a paid LLM. It is rate-limited
  (20/min/IP) and disabled when `MINIMAX_API_KEY` is unset, but set `CORS_ORIGINS`
  and consider a reverse proxy / auth in front of it for public deployments.
- **Hardening in place:** env-driven CORS, per-IP rate limiting, a request body-size
  guard, and per-endpoint array caps (see `apps/api/src/index.ts`).
- **Secrets:** `.env` (MiniMax key) is git-ignored; never commit it. `flight.xls`
  (raw itinerary with ticket numbers) is git-ignored — only the sanitized
  `flights.json` is committed.

## Known advisories

`npm audit` reports a few **moderate, dev-only** advisories in the Vite/esbuild/Vitest
toolchain (dev server SSRF / path traversal). They do **not** affect the production
build or runtime. The previously-high `xlsx` advisory is resolved by using the official
SheetJS distribution (`cdn.sheetjs.com`) instead of the stale npm package.
