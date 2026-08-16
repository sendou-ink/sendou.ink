# differ

Differential test harness for the React → Svelte migration (built in Phase 1 of
`svelte-big-bang.md`). Runs `apps/web-react` (the oracle) and `apps/web` against
the same seeded database with a frozen clock and diffs them directly:

- **Pixel diff** (gate) — screenshot every route in the generated census
  (route × theme × viewport), strict threshold.
- **SSR HTML diff** (gate) — normalized `<head>` comparison per route to protect
  SEO through the cutover.
- **Resource diff** (gate) — non-HTML routes (api-public, resource routes,
  redirects) compared on status, content type, location and body.
- **ARIA structure diff** (advisory) — Playwright ARIA snapshots as a report to
  eyeball, not a 1:1 gate.

Until `apps/web` exists both sides serve `apps/web-react`: the React-vs-React
run must report zero diffs before the harness judges anything (Phase 1 exit
gate).

## Running

```sh
pnpm run differ                       # full census, both themes and viewports
pnpm run differ -- --filter /leaderboards
pnpm run differ -- --max-rows 20 --themes light --viewports desktop
pnpm run differ -- --seed-now 2026-08-16T12:00:00Z --concurrency 2
pnpm run differ -- --skip-prepare     # reuse the previous build + seeded dbs
pnpm run differ -- --right-app web --filter /leaderboards   # React vs Svelte
```

`--right-app web` serves `apps/web` (the SvelteKit app) on the right side;
the default (`web-react`) is the React-vs-React control run. The left side is
always the React oracle.

Heads-up: a run holds two production servers plus a Chromium instance — a
couple of GB of memory. Run it from a plain terminal, not nested under other
memory-heavy tooling, and leave `--concurrency` at its default (1) on smaller
machines.

The run writes `output/<timestamp>/`:

- `report.json` — every row's results plus a summary; exit code 1 when a gate
  (pixel / head / resource) failed
- `census.json` — the generated route census
- `artifacts/<route>/<variant>/` — `left.png` / `right.png` / `diff.png`,
  normalized head HTML, ARIA snapshots — written only for rows that differ

## How a run works

1. `scripts/ensure-e2e-build.ts` — the same production build the e2e suite
   serves (`VITE_E2E_TEST_RUN=true` baked in), reused when fresh.
2. Migrate + seed `db-differ-seed.sqlite3` with the clock frozen at `SEED_NOW`
   (`scripts/seed.ts` installs `installSeedClock`), then copy it for each side.
3. `scripts/route-census.ts` — walks `app/routes.ts` and resolves every dynamic
   param from the seeded database. Never hand-listed: a new route without a
   resolver is a hard error; a resolver finding no seed data marks the row
   `skipped` and the report keeps it visible (seed-coverage gap).
4. Two servers start on ports 6873/6874 (heap-capped), one database copy each,
   both with the same baked `VITE_SITE_DOMAIN` so absolute URLs are identical.
5. Per browser context (side × theme): log in as the seeded admin via
   `/auth/impersonate`, set the theme cookie via `/theme`, freeze the client
   clock at `SEED_NOW` (context-level Playwright clock), reseed `Math.random`
   per document, and abort every request leaving localhost (fonts and
   third-party images fail identically on both sides).
6. Per page row: wait for hydration, kill animations, screenshot until two
   consecutive shots are identical (canvas charts settle), then compare.
   Pages taller than the capture cap are clipped — decoded RGBA of unbounded
   pages is what OOMs the process. Decoded-pixel comparison is serialized for
   the same reason; identical screenshots (the common case) skip decoding.

## The app contract

What a served app must provide for the differ (and the e2e suite) to work
against it — the Svelte app has to implement the same surface:

- `data-testid="hydrated"` element once client JS is ready, carrying
  `data-router-idle="true"` when no navigation/mutation is in flight
- `data-testid="error-page"` on the error boundary page
- dev-controls endpoints under the e2e build flag: `POST /auth/impersonate?id=`,
  `POST /theme` (`theme=light|dark`), `POST /refresh-caches`,
  `POST /end-season`, `POST /run-routine`
- the shared `data-testid` vocabulary used by `e2e/pages/**` (no CSS-module
  class or icon-class selectors — enforced by keeping `class*=`/`lucide-` out
  of `e2e/`)
