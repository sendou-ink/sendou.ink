# differ

Differential test harness for the React → Svelte migration (built in Phase 1 of
`svelte-big-bang.md`). Runs `apps/web-react` (the oracle) and `apps/web` against
the same seeded database with a frozen clock and diffs them directly:

- **Pixel diff** (gate) — screenshot every route in a generated census
  (route × theme × viewport), strict threshold.
- **SSR HTML diff** (gate) — normalized `<head>` comparison per route to protect
  SEO through the cutover.
- **ARIA structure diff** (advisory) — Playwright ARIA snapshots as a report to
  eyeball, not a 1:1 gate.

The route census is generated from seed data (never hand-listed) and verified
first React-vs-React: the harness must report zero diffs against itself before
it judges the Svelte app.
