# codemods

Idempotent, manifest-aware transforms for the React → Svelte migration
(`svelte-big-bang.md`). All are re-runnable while the React app remains the
source of truth.

| Script | Status | Purpose |
| --- | --- | --- |
| `mono-split` | done (Phase 0) | rewrites `apps/web-react` import specifiers to the extracted workspace packages (`@sendou/in-game-lists`, `@sendou/tournament-engine`, `@sendou/utils`, `@sendou/build-analyzer`, `@sendou/map-list-generator`, `@sendou/scanner-core`) |
| `manifest` | done (Phase 0) | `generate` merges features + routes into `migration-manifest.json` preserving recorded statuses; `report` prints progress totals |
| `route-map` | planned (Phase 2+) | `routes.ts` → SvelteKit route directories + URL-parity manifest |
| `remote-scaffold` | planned (Phase 2+) | loader files → `query()` scaffolds; action files → per-`_action`-branch `form()`/`command()` scaffolds |
| `jsx-to-svelte` | planned (Phase 2+) | the deterministic 80% of TSX → Svelte; everything unprovable becomes an `@MIGRATE` marker |
| `css-inline` | planned (Phase 2+) | inlines each component's `.module.css` into its `<style>` block |

Run with `pnpm --filter @sendou/codemods run <script>` (plain Node 26, no build
step).
