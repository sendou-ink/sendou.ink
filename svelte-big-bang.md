# Svelte Big Bang

Migration plan for sendou.ink: React Router 8 → Svelte 5 + SvelteKit 3, monorepo, remote functions, one cutover. From the user's point of view, nothing happens. That's the goal.

> Version note: the target is **Svelte 5 (runes) + SvelteKit 3** (currently release candidate, stable expected shortly — no further breaking changes planned). Starting greenfield on 3 means we never do a Kit 2→3 migration mid-project. Kit 3 details that help us: it requires **Vite 8** (the repo is already on Vite 8), config lives in `vite.config.ts`, `$lib` becomes `#lib` via Node subpath imports (which composes cleanly with monorepo package exports), and error handling is rebuilt on Svelte 5 boundaries. **Remote functions are still experimental behind a flag even in v3** — we pin versions and wrap the API (see Risks).

---

## What we're actually migrating

Measured from the repo today:

| Surface | Size |
|---|---|
| Feature folders | 70 |
| Routes in `routes.ts` | 170 |
| TSX (the real work) | ~95k lines |
| Plain TS (mostly ports verbatim) | ~166k lines |
| Files exporting a `loader` | 133 |
| Files exporting an `action` | 81 |
| Shared components | 108 in `app/components` + 53 in `app/components/ui` |
| `react-aria-components` usage | 44 files |
| Playwright e2e specs | 44 |
| `useState` / `useEffect` / `createContext` | 162 / 61 / 9 |
| `<Trans>` usages (the annoying i18n case) | 12 |
| dnd-kit / flip-toolkit / chart.js files | 12 / 5 / 3 |
| map-planner (stays behind) | ~1k lines TSX + tldraw |

The headline: **almost two thirds of the codebase is plain TS** — repositories, core logic, schemas, utils, the scanner. That code moves across nearly untouched. The migration is really ~95k lines of TSX plus the router/data wiring, guided by 44 e2e specs that already encode what the site must do.

Two free wins found while auditing: the 5 `react-flip-toolkit` files map to Svelte's built-in `animate:flip`, and `swr` (used via `swr/immutable` in one hooks file — 3 hooks, 3 call sites, lazily fetching resource-route JSON) is exactly what remote `query()` does natively, per-args caching included. That file even carries a TODO wishing for a better data-fetching primitive; remote functions are it — the dependency disappears.

---

## The three load-bearing ideas

Everything else in this plan hangs off these.

### 1. Big bang at deploy time, incremental on `main`

The monorepo hosts **both apps side by side**: `apps/web-react` (current app, feature-frozen, stays the deployed one) and `apps/web` (SvelteKit, growing). Both consume the same extracted packages. Every migration commit lands on `main` and CI stays green the whole time — no six-month mega-branch to rebase. "Big bang" happens only at cutover: the deploy target flips, and the React app remains deployable for instant rollback.

This also makes the React app a permanent, in-repo **oracle** — which enables idea 2.

### 2. Differential testing instead of baseline management

We don't hand-curate visual regression baselines. We run **both apps against the same seeded database with a frozen clock** and diff them directly:

- **Pixel diff** — screenshot every route in a generated census (route × theme × viewport), React vs Svelte, strict threshold.
- **Structure diff (advisory)** — Playwright ARIA snapshots on both apps, but as a report to eyeball, **not** a 1:1 gate: the handwritten components are *supposed* to have different internals than react-aria (a react-aria modal becomes a plain `<dialog>`). The diff exists to catch accidents — a table that became divs, a button that became a span — not to demand parity.
- **SSR HTML diff** — curl every route on both servers, normalize, diff `<head>` (meta, og tags, hreflang, inlined i18n). Protects SEO through the cutover.

Because the oracle lives in the repo and the seed is deterministic, baselines are *reproduced*, never stored or bit-rotted. A feature is "done" when its e2e specs pass against the Svelte app **and** its differential diffs are clean. The prerequisite is determinism: seed relative to a `SEED_NOW` env var, freeze the client clock via Playwright's clock API, disable animations under test.

### 3. A migration manifest drives the fleet

A checked-in `migration-manifest.json` is the single source of truth: every file/route/feature with a status (`pending → scaffolded → migrated → verified`), which codemod produced it, and its verification results. All codemods are idempotent against it. It is simultaneously the Opus work queue, the progress dashboard, and the cutover checklist — cutover is legal only when every row reads `verified`.

---

## Target monorepo shape

```
apps/
  web/            SvelteKit 3 + Svelte 5 (adapter-node, custom server for cron)
    src/lib/
      features/<name>/   feature folders, same layout as today (routes glue, components, repositories, *.remote.ts)
      db/                kysely dialect, tables.ts, migrations
      i18n/              locales/ (translator-facing JSONs) + project.inlang + generated paraglide messages
      modules/           search-params, permissions, in-game-lists, …
  web-react/      current app, frozen; the oracle; deleted after the final planner split
  planner/        map-planner + tldraw as-is (React), → planner.sendou.ink; carved out of web-react in the final phase
packages/
  components/     the UI kit: Button, Dialog, Select, VirtualList, use:sortable, …
  tournament-engine/   self-contained bracket/standings/progression logic
  in-game-lists/  modes, stages, weapons, abilities — the shared game vocabulary
  utils/          pure leaf helpers (invariant, result, random, number, types, logger)
  build-analyzer/ build stat math + weapon params (analyzer, object dmg calc, scanner all consume it)
  map-list-generator/  MapPool + tournament map list generation
  scanner-core/   the scanner's CV detection core (detectors, glyphs, match building)
  schemas/        reusable valibot schemas (id/field primitives, shared form shapes) consumed by app code
  …               more only when a block earns it
tooling/
  codemods/       ts-morph transforms (below)
  differ/         differential test harness
```

Notes on the shape:

- **Workspaces are reserved for things with a real boundary**: the UI kit (developed against the showcase, testable standalone, knows nothing about sendou.ink) and self-contained blocks like `tournament-engine` — pure logic that could ship as its own library: no db imports, no i18n, no app state. Extracted so far: `in-game-lists`, `tournament-engine`, `utils`, `build-analyzer`, `map-list-generator`, `scanner-core`. A block gets extracted only when its boundary is *already* clean — extraction is a promotion, not a project.
- **Features are plain folders inside `apps/web`**, same as today — they keep importing each other freely, repositories stay inside their feature folder, and there is no cycle-breaking project because there are no forced package boundaries between features.
- **Route files are thin shells.** We use SvelteKit's folder routing, but a `+page.svelte` carries no logic of its own: it composes a few components imported from `lib/features/<name>/` and wires in the feature's remote functions — **~100 lines max per route component**. Everything real (components, remote functions, repositories, utils) lives in the feature folder, exactly as `routes.ts` + feature folders work today; only the wiring moved into the filesystem. The `route-map` codemod generates route files in this shape, and a lint check keeps them thin so the fleet can't quietly grow logic into `src/routes/`.
- **db and i18n live inside `apps/web`** — single consumer, no workspace overhead. During the migration window `apps/web-react` keeps its own frozen copies; drift is impossible by policy because the schema doesn't change during the migration (a boring migration needs no new tables — with one deliberate exception: the chat rebuild adds its own tables, see the chat section) and locale JSONs are shared by both apps read-only.

---

## How the stack maps

### Data layer: loaders/actions → remote functions

This is the part of the codebase best positioned for the migration:

- Loaders already live in dedicated `loaders/` files → each becomes a `query()` in `<feature>.remote.ts`. Remote function validation accepts any Standard Schema, so the **valibot schemas** (converted from zod — see the validation subsection below) plug directly in.
- Actions already use `_action`-discriminated zod unions → the codemod **splits each union branch into its own `form()`/`command()`**. This is the one place the code gets structurally *better* for free, while staying boring externally.
- `<ActionButton>` (typed `_action` + hidden inputs) → a button wired to a remote `command` or a remote form's button props — same type-safety guarantee, less machinery.
- `SendouForm` (`app/form/`) → `SendouForm.svelte` wrapping a remote `form`: same schema-driven field API on top, remote-function plumbing underneath. **This wrapper is the churn insulation** — when the experimental API moves, we fix one file, not 81.
- **Single-flight mutations are the house style for every mutation** ([docs](https://svelte.dev/docs/kit/remote-functions#Single-flight-mutations)). The default behavior — `form` refreshing *all* queries on the page in a second round trip — is exactly wrong for both of our hard goals (one server, snappy UX): it doubles the request count per mutation and re-runs every query on the page against the database. Convention instead:
  - **Server-driven refreshes preferred**: the `form`/`command` handler itself calls `getX(args).refresh()` (or `getX(args).set(result)` when the mutation already computed the new value — zero extra query cost) for precisely the queries it invalidated. Fresh data rides back in the mutation response — one round trip, minimal DB work, and callers don't need to know what to invalidate.
  - **Client-driven `.updates(...)` is the fallback**, only where the server genuinely can't know which query instances the client holds (filter/pagination args); pair with `.withOverride()` where optimistic UI is worth it.
  - Enforced structurally, not by vigilance: `SendouForm.svelte` and the `command` helper are where mutations live, so the wrappers make the server-driven refresh the paved path, and the cookbook's write-path entry (from the `/scrims` slice) shows only this shape — the fleet never emits refresh-everything mutations.
- `requireUser`/auth context → `getRequestEvent()` inside remote functions; same repository calls.
- **`prerender()` where the data allows it** — the fourth remote function type bakes query results to static payloads at build time, served without touching the server or the database. Targets identified up front:
  - **articles** — repo content, the textbook case.
  - **patron list** — today a client-side fetch (one of the three swr hooks); becomes a prerendered query, so the footer costs nothing at runtime.
  - **xsearch (top-search) + leaderboards for completed seasons** — immutable once a season ends; enumerate season numbers via `inputs`, keep the current season a live `query()`. "At least the most recent seasons" prerendered; older ones can join the list at zero marginal cost.
  - **build stats / popular builds per weapon** — currently cachified with a 1-hour TTL; `inputs` = all weapon slugs, and an hour-stale copy was already the accepted freshness, so build-time baking is strictly better (no cold cache, no server work).

  The tradeoff to respect: prerendered data is frozen until the next deploy, so it fits where data changes slower than the deploy cadence or where TTL-staleness was already accepted. cachified's remaining users (sidebar counts, streams, trophies, tiers) genuinely need runtime freshness — they stay as cached `query()`s, and `@epic-web/cachified` shrinks to those few call sites.

### Validation: zod → valibot

Decided: the Svelte app validates with **valibot** ([migration guide](https://valibot.dev/guides/migrate-from-zod/)); zod does not come along.

- **Why**: valibot's modular, function-based design tree-shakes — a schema costs only the validators it actually uses. That matters more than before because schemas now ship to the client inside remote forms; zod's monolithic class API can't shrink the same way. And valibot implements Standard Schema, so remote function validation, `SendouForm.svelte`, and the search-params module consume it exactly as they would have consumed zod — nothing downstream cares which library produced the schema.
- **`packages/schemas` (`@sendou/schemas`) holds the reusable schemas**: id/field primitives (`id`, `weaponSplId`, `modeShort`, `ability`, …), shared form shapes (usernames, URLs, dates, pagination), and cross-feature schemas that repositories and remote functions validate against. App code imports them by package name; feature-specific one-off schemas stay in the feature folder next to their remote functions — the package is for schemas with 2+ consumers, same promotion rule as every other workspace package.
- **Conversion is mechanical**: valibot maintains an official codemod for the zod → valibot rewrite; our `zod-to-valibot` pass (see the codemod suite) wraps it, runs per feature alongside `remote-scaffold`, promotes shared schemas into `@sendou/schemas`, and flags the exotic zod APIs it can't prove (`z.preprocess`, custom `superRefine` logic) with `@MIGRATE` for hand-finish.
- **The React app stays on zod untouched** — it's frozen, and its schemas remain the conversion source of truth until each feature migrates. zod leaves the dependency tree at cutover along with React.

### Pattern cookbook (the Opus bible)

`MIGRATION.md` in the repo root: a before/after pair for every recurring pattern. Opus agents follow it and never improvise; any pattern not in the book is an escalation, and the resolution becomes a new entry (the book only grows). Seed entries:

| React / React Router | Svelte 5 / SvelteKit |
|---|---|
| `useLoaderData()` | `await query()` in component (`<svelte:boundary>` for pending/error) |
| `useState` (162×) | `$state` |
| derived-in-render | `$derived` |
| `useEffect` (61×) | mostly **delete** (loaders/reactivity subsume them); rest `$effect` |
| `createContext`/`useContext` (9×) | shared `$state` in `.svelte.ts` modules, plain imports — no context machinery (per Svelte's own "when to use stores": mostly never). One guardrail in the cookbook: module state is a server-side singleton, so anything per-user/per-request stays in load/query data or gets `$state` initialized client-side only |
| props / children / render props | `$props()` / snippets |
| `react-error-boundary` | `<svelte:boundary>` / `+error.svelte` |
| `react-flip-toolkit` (5×) | built-in `animate:flip` |
| `chart.js` via react-chartjs-2 (3×) | chart.js directly via `{@attach}` |
| `clsx` | **built into Svelte's `class` attribute** (5.16+ runs clsx internally): `className={clsx("a", cond && "b", {c})}` → `class={["a", cond && "b", {c}]}` — the codemod unwraps the call, the dependency goes away |
| CSS modules (232 files) | Svelte scoped `<style>` blocks via the `css-inline` codemod (see below) |
| `useTranslation` + `t("ns:key")` | **Paraglide** typed message functions — `m.ns_key()` — via a deterministic call-site codemod (static keys convert mechanically; dynamic keys get `@MIGRATE` markers). See the i18n subsection below |
| `<Trans>` (12×) | paraglide messages with parameters, or restructure those 12 keys |
| `<LocaleTime>` etc. | ported to `packages/components`, same names |
| meta functions | `<svelte:head>` (verified by SSR HTML diff) |
| `handle.i18n` namespaces | **gone** — paraglide messages are plain imports, tree-shaken per route; no namespace loading, no `i18next-http-backend` round-trips |
| zod schemas | **valibot** via the `zod-to-valibot` codemod; shared schemas promoted to `@sendou/schemas`, one-offs stay in the feature folder |
| `useSWRImmutable` hooks over resource routes (`app/hooks/swr.ts`, 3 hooks) | remote `query()` called on demand from the component — caching per args is built in; `swr` dependency and the resource routes it fetched both go away |
| nprogress on navigation state | nprogress driven by SvelteKit's navigation store |
| `shouldRevalidate` + search-params module | search-params core is pure TS with round-trip tests — port the module minus its revalidation surface: `shouldRevalidate` **and the per-param `loader` flag are both deleted** (the definition-porting codemod strips `loader:`). Refetching is decided by which decoded params a component wires into remote query args — queries are keyed on their args, so a URL write that decodes to the same values is a cache hit. Every param write is one shallow replace `goto`, which reruns nothing by itself |
| revalidation after actions | **single-flight mutations, server-driven** — the handler refreshes/`set`s exactly the queries it touched (see the data-layer convention above); never the refresh-everything default |

Two conventions that apply across every cookbook entry:

- **Snippets are how a bigger component splits into smaller ones.** In React we split a large component into small helper components in the same file; the Svelte equivalent is `{#snippet}` blocks rendered with `{@render}` — private, in-file, and able to take parameters like props. A helper only graduates to its own `.svelte` file when it gains a second consumer or a real standalone identity, same promotion rule as everywhere else in the plan. This also shrinks the file-split surface of the `css-inline` codemod: React helper components that stay in-file as snippets keep their classes in the same `<style>` block, no CSS partition needed.
- **`xxx:` comments are the migration's TODO marker.** Anything discovered mid-migration that must be resolved before the migration is complete — but isn't being fixed on the spot — gets an `xxx:` comment at the site (`// xxx: keyboard nav not ported yet`). It complements the codemod-emitted `@MIGRATE` markers: `@MIGRATE` means "the codemod couldn't prove this, hand-finish it", `xxx:` means "a human or agent judged this unfinished". Both are grep-gates — cutover (Phase 7) requires zero `@MIGRATE` and zero `xxx:` comments in `apps/web`.

### Svelte skills (installed, mandatory)

The official Svelte skills from [sveltejs/ai-tools](https://github.com/sveltejs/ai-tools) are installed in `.claude/skills/` and are **always used for Svelte work** — no agent writes, edits, or reviews `.svelte` / `.svelte.ts` code without them:

- **`svelte-core-bestpractices`** — load before touching any Svelte code; it's the authority on runes usage (`$state.raw` for reassign-only data, `$derived` over `$effect`, effects as escape hatch), keyed each blocks, snippets, event handling, and the legacy-feature blocklist.
- **`svelte-code-writer`** — the `npx @sveltejs/mcp` CLI: `list-sections`/`get-documentation` when unsure about syntax, and **`svelte-autofixer` runs on every Svelte file before it's marked done** — it's part of the fleet's per-feature loop alongside e2e and the differ. Always pass `--async` (we use await expressions; without it every `await` in a component is a bogus "issue"). Known false-positive classes from the first sweep, don't churn on them: `svelte-ignore <code> -- reason` prose is valid in runes mode (the compiler stops parsing codes at the first one without a trailing comma) but the autofixer flags each prose word as an unused ignore; ephemeral `Map`/`Set`/`Date` inside a `$derived.by` or non-reactive module caches don't need the `Svelte*` reactive variants; and mounted-flag `$effect`s (`hydrated = true`) plus external-API sync effects (nprogress, popover positioning) are accepted patterns.

Where skill guidance and this plan disagree (e.g. the skill prefers `{@attach}` over `use:` actions, and context over shared-module state), the conflict is resolved in the cookbook and the cookbook wins — agents never pick sides ad hoc.

**CSS decision (made): migrate CSS modules → Svelte scoped styles.** 232 `.module.css` files convert as part of the feature migration, not after. The mechanics:

- The `css-inline` codemod inlines each component's `.module.css` into its `<style>` block and rewrites `styles.foo` → `"foo"` (only **5** dynamic `styles[...]` accesses exist in the whole codebase — hand-fix those). Conditional classes need no library: Svelte's `class` attribute accepts clsx-style arrays/objects natively.
- `vars.css` and `utils.css` stay as global stylesheets; scoped styles reference the same CSS variables, so theming is untouched.
- **The hand-finish surface is shared modules**: ~25 `.module.css` files are imported by 2+ files (worst: `bracket.module.css` and scanner's `EventCard.module.css` at 10 importers each, `user-page.module.css` and `Select.module.css` at 9–10). Scoped styles belong to exactly one component, so each shared class either moves into the component that owns it, becomes a utility class, or — sparingly — goes `:global`. The codemod flags these with `@MIGRATE` rather than guessing.
- Related structural shift: React files hold many components; Svelte is one component per file. The file split and the CSS partition are the same decision — the codemod proposes the split, the migrating agent confirms which classes follow which component.
- Cross-component selectors (`.parent > .childComponentClass`) that CSS modules quietly permitted will break under scoping — good, they were reach-ins; restyle via props/snippets or explicit `:global` with a comment.
- Free win: Svelte warns on unused selectors at compile time, so years of dead CSS surfaces automatically during conversion.

Computed styles should come out identical, so the pixel differ keeps its strict thresholds — it's precisely the safety net that makes this conversion affordable inside the big bang. Expect the CSS rewrite, not the markup, to be the main source of legitimate differ investigation during the fleet phase.

### i18n: i18next → Paraglide

Decided, and prototyped on the earlier `experimental` branch — we port that setup rather than reinvent it:

- **`locales/` JSONs stay the translator-facing source of truth** (16 languages, per-namespace files, `i18n:sync` workflow survives). A ported `combine-locales` script compiles them into paraglide's message format; translators keep working exactly as today.
- **Call sites become typed message functions**: `t("ns:key")` → `m.ns_key()`, converted by a deterministic codemod (the vast majority of keys are static; dynamic key construction gets `@MIGRATE` markers). Missing keys become type errors instead of runtime blanks.
- **Dev bundles English only** — the trick from the experimental branch: `project.inlang/settings.json` permanently lists `locales: ["en"]`, keeping paraglide compile and dev-server startup fast. The production build script (`build-with-all-locales`) temporarily swaps all 16 locales into the settings (backup/restore around the build), runs `combine-locales`, then builds. Working *on* translations in dev is an env-var opt-in to more locales.
- **Output structure follows the mode**, as prototyped: `message-modules` in production for per-message tree-shaking, `locale-modules` in dev for compile speed.
- **The bundle/runtime win is structural**: no i18next runtime, no client-side namespace fetching — messages are plain imports tree-shaken per route, and only the active locale ships. The recent "inline initial i18n namespaces into SSR HTML" optimization becomes obsolete rather than ported.

### Infra replacements

| Today | After |
|---|---|
| `remix-auth` + `remix-auth-oauth2` | **hand-rolled Discord OAuth2** in `hooks.server.ts` — it's one authorization-code flow against one provider; a library earns nothing here. Two route handlers (`/auth` redirect, `/auth/callback` code exchange) plus session validation in the handle hook, reusing the existing `User` table untouched. Because we own the session scheme, **keep the cookie name/format/secret identical to today's → nobody gets logged out at cutover** and no auth schema migration exists at all. The session/cookie layer and impersonation login shipped with the leaderboards slice; the Discord flow itself lands in Phase 3.5. |
| i18next + `react-i18next` + `remix-i18next` + `i18next-browser-languagedetector` + `i18next-http-backend` | **Paraglide** (all five i18next packages deleted); locale resolution via paraglide's `['cookie', 'preferredLanguage', 'baseLocale']` strategy, matching today's behavior |
| node-cron in server process | `adapter-node` with custom server entry |
| compression patched out of `@react-router/serve` | same policy carries over: **no app-level compression in SvelteKit** — Render (and Cloudflare) compress at the edge. Don't add compression middleware to the custom server, and leave adapter-node's `precompress` off so we're not building/serving `.br`/`.gz` assets nobody needs |

### Chat: rebuilt, not ported

Chat is the one feature that gets **redesigned rather than migrated 1:1** — the current skalop/chatCode implementation doesn't survive the transport change, so the Svelte app gets a proper model:

- **Storage is sqlite**: `ChatRoom` / `ChatRoomMessage` / `ChatRoomRead` tables. The unseen-message marker lives in sqlite too (`ChatRoomRead`), not in client-side heuristics.
- **Transport is `query.live`** over the in-process event bus (see the one-offs ledger) — zero calls to skalop. This is where the client simplifies dramatically: no websocket lifecycle, no manual reconnect, no message-merging state; the component just awaits a live query of the room's message list.
- **Room lifecycle: active → inactive → archived → deleted.**
  - *Inactive* (e.g. a tournament chat after the set ends): messages can still be sent — people say their ggs — but the room-list page separates inactive rooms clearly from active ones.
  - *Archived* (time-based after `inactiveAt`): no more sending, and the room disappears from the list — it's only reachable by navigating to its route directly.
  - A routine **permanently deletes** a chat once it's been inactive for 1 week. Some chats are deleted outright immediately (e.g. a sendouq group disbands).
- **Split chat support at the data level** — the room model accommodates split chats natively instead of the client stacking rooms together.
- **Proper auth**: room membership is checked server-side per query/mutation — knowing a chatCode is *not* enough to download messages, unlike today.

Two plan-level consequences: this is the one place new tables land during the migration window (additive migrations in shared `/migrations`; the frozen React app never reads them), and chat UI is **expected-different in the differ** — it's a redesign, so its routes are marked accordingly in the manifest rather than held to pixel parity.

### One-offs ledger

Bespoke mechanisms hand-built into the React app, each with a decided fate — several simply come with SvelteKit. The slices and the fleet will surface more; new discoveries get appended to this ledger in `MIGRATION.md` rather than resolved ad hoc.

| One-off today | Fate |
|---|---|
| Reload on new deploy — `useReloadOnNewDeploy` watching `GIT_COMMIT` through polled layout data | **Deleted — built in.** `kit.version.pollInterval` + `updated` from `$app/state`; on `beforeNavigate`, an update triggers a full-page navigation. Whole mechanism becomes ~3 lines of config |
| Reload on stale auth — `useReloadOnStaleAuth` reloads when client/server user ids disagree | Kept; trivial port of the same check |
| `UnsavedChangesGuard` — one root-level `useBlocker` + a dirty-checker registry (React Router allows a single active blocker) | `beforeNavigate` + native `beforeunload`. The registry pattern survives; the single-blocker contortion it existed for doesn't |
| `<ScrollRestoration>` in root | **Deleted — built into the SvelteKit router** |
| nprogress wiring in root | Kept, driven by `navigating` from `$app/state` |
| `isbot` in `entry.server` (picks the React streaming callback for bots) | **Deleted** — no streaming-callback split to make; the dependency goes away |
| Theme no-flash inline script (`theme/core/provider`) | Ported as an inline script in `app.html`, as today |
| `usePreloadTranslation` in root | **Deleted — obsolete under paraglide** (messages are imports, nothing to preload) |
| Service worker `/sw-2.js` + `app.webmanifest`, registered in `entry.client` | Ported to SvelteKit's service-worker convention. One new constraint: **the SW must never cache `query.live` responses** (a cached clone keeps streaming forever) — exclude `no-store` responses in its fetch handler |
| `persisted-state` module (localStorage-backed hooks, has its own tests) | Rewritten as `.svelte.ts` `$state` + storage sync, keeping the module's API and porting its tests |
| CSR-only routes via `useHydrated()` + `<Placeholder />` — pages that skip SSR because React server rendering is too slow: the tournament view (`to.$id`), build analyzer, `q.looking`, comp-analyzer, tier-list-maker, scanner, tournament-lfg, widget editor | **Un-gate and SSR them.** Svelte's server rendering is string concatenation, cheap enough that these pages get real HTML for the first time — better first paint and SEO on some of the most-visited pages on the site (the tournament page!). Keep SvelteKit's per-route `ssr = false` only where CSR is inherent (scanner needs camera + OpenCV; tier-list-maker is a pure client toy). Differ note: these routes will *legitimately* fail the SSR HTML diff against the React oracle — the oracle serves a placeholder. Compare them post-hydration in the pixel diff and mark the HTML diff expected-better in the manifest |
| skalop + partysocket (chat, notification pings) | **replaced by `query.live`** — the skalop microservice goes away entirely, and with it the client websocket library and the "deploy skalop first" ordering constraint. Live queries are async generators streamed over plain HTTP fetch; the fan-out skalop did becomes an **in-process event bus**: mutations (`command`/`form`) publish to a channel, live-query generators subscribed to that channel yield fresh data, SvelteKit streams it to every subscribed client. Viable precisely because the app is a single Node process — no cross-instance pubsub needed. Reconnection with backoff is built in. One semantic to respect in the cookbook: live streams keep only the latest pending value (not an event log), so generators yield *snapshots* (current message list / unseen-count), never individual events. Chat itself is not a port but a rebuild on this foundation — see the chat section above |
| React Compiler | gone; Svelte's compiler is the point |
| `vitest-browser-react` | `vitest-browser-svelte` (browser-mode screenshot tests carry over as a pattern) |
| `react-use-draggable-scroll` | small handwritten action |
| dnd-kit (12 files) | **handwritten pointer-events drag-and-drop action** (decided) in `packages/components` — usage here is sortable lists/grids, not free-form canvas, so one `use:sortable` action with keyboard fallback covers all 12 files. Built once in Phase 3, exercised by the map-pool and seeding UIs |

---

## Phases

### Phase 0 — Monorepo-ify while still React (Fable)

Pure refactor, zero behavior change, verified by the existing `pnpm run checks` + full e2e suite.

1. pnpm workspace; move the app → `apps/web-react` unchanged.
2. Extract `packages/tournament-engine` (and any other block whose boundary is already clean, confirm proposed list with user) via the `mono-split` codemod; `apps/web-react` consumes it from the workspace — proving the package is real before any Svelte exists.
3. Land the manifest + codemod tooling skeleton.

**Exit gate:** e2e suite green, production deploy from the new layout.

### Phase 1 — Verification harness (Fable)

1. Determinism: `SEED_NOW`, frozen clocks, animation kill-switch under test.
2. Route census generator: enumerate all 170 routes with representative params drawn from seed data (generated, not hand-listed — hand lists rot).
3. Differential harness: pixel diff + SSR HTML diff as gates, ARIA structure diff as an advisory report.
4. Make e2e specs app-agnostic: audit all 44 for React-isms/hashed-class selectors; parametrize `baseURL`.

**Exit gate:** differ runs React-vs-React and reports zero diffs (proves the harness before it judges anything).

### Phase 2 — Vertical slice 1: `/leaderboards` (Fable)

Not a horizontal foundation phase — one real page shipped end-to-end, building only the infrastructure it forces into existence. `/leaderboards` is the ideal first slice: public, read-only, search-param-heavy, data-dense, and it already has a search-params definition, repository tests, and a browser screenshot test.

The slice drags in, minimally: the SvelteKit boot + app shell (layout/sidebar/nav, theme no-flash script, error pages), the paraglide pipeline (English-only dev settings and all), the search-params module port (round-trip tests come along), `route-map` for this route, one `loader → query` conversion through the real codemod, and only the components the page actually uses (tables, tabs/select, pagination, weapon/user cells). Done means: differ pixel + HTML diffs clean for the `/leaderboards` census rows, e2e coverage green (adding a small spec if none exists).

Deliverable: the **golden read-path pattern** — the first cookbook entries come from here, and every codemod has now run against real code.

### Phase 3 — Vertical slice 2: `/scrims` (Fable)

The second slice picks a feature with everything the first one didn't have: login required, real mutations, forms, posting/accepting flows. Several of its prerequisites already landed with the leaderboards slice and the app shell built around it — Phase 3 consumes these rather than building them:

- **Auth = impersonation only in this phase.** The cookie-compatible session layer exists (`apps/web/src/lib/features/auth/session.server.ts` reads/writes the React app's `__session` cookie byte-for-byte — same name, JSON→base64 encoding and HMAC signature; `getUser`/`requireUser`/`actorId` hang off `locals` in `user.server.ts`), and so does impersonation login: `/auth/impersonate` + `/auth/impersonate/stop` routes wired to the dev login controls in `TopNavMenus.svelte`. All logged-in work in this slice runs through impersonation — which is exactly how e2e specs log in and how local dev works. **Real Discord OAuth is deliberately deferred to Phase 3.5.**
- **The single-flight mutation shape already has a seed**: `leaderboards.remote.ts` ships `command()`s (`skipTeam`/`unskipTeam` with server-driven refresh) and the sidenav a remote `form()` (`setSidenavCollapsed`). Phase 3 scales the shape from admin one-liners to real multi-field forms and posting/accepting flows.
- **Native dialog/popover primitives** landed with the layout surfaces, and the notifications feature already has its `getNotifications` query plus bell/`NotificationDot` components in the shell — Phase 3's realtime work upgrades an existing static bell, not a from-scratch one.
- The scrims feature folder already carries its ported repositories (`ScrimPostRepository.server.ts`, the `Scrim` model, types).

What Phase 3 genuinely forces into existence: `SendouForm.svelte` + the remote-form wrappers (the churn insulation gets proven here), the `ActionButton → command` mapping with **single-flight mutations proven end-to-end on a real write path** (accept-scrim refreshes exactly the scrim queries server-side, one round trip), Combobox/Select-grade form components on top of the native primitives, and the realtime foundation — the in-process event bus with the notification bell dot as the first `query.live` consumer (scrim offers generate notifications; the 10s-grace-period behavior carries over). `scrims.spec.ts` green + differ clean.

> **Chat lands here.** Scrims have chat, so this slice also carries the **chat rebuild** (see the chat section): the `ChatRoom` / `ChatRoomMessage` / `ChatRoomRead` migrations land, and a scrim's chat becomes the first real `query.live` message-stream consumer — proving live streaming through Cloudflare + Render on an actual conversation, server-side membership auth, sqlite-backed unseen markers, and the active → inactive → archived → deleted lifecycle (a scrim chat going inactive after the scrim, then being swept by the deletion routine, exercises the whole arc). Because chat is a redesign rather than a port, its UI is marked expected-different in the differ manifest — the rest of the scrims slice still holds to pixel parity.

Deliverable: the **golden write-path pattern**. Between the two slices, every architectural bet in this plan (remote functions, remote forms, paraglide, scoped styles, `query.live`, the differ) has been exercised on production code.

### Phase 3.5 — Real auth: Discord OAuth (Fable)

Its own phase, on purpose: nothing in Phase 3 — or the fleet after it — needs a real Discord login, because e2e specs and dev workflows authenticate via impersonation. Splitting it out keeps the scrims slice from blocking on OAuth app credentials and redirect-URI setup, and lets the flow be verified against a deployed preview on its own schedule.

The work is the hand-rolled flow from the infra table: two route handlers under `/auth` (redirect to Discord, callback code exchange) plus the login button wiring — session validation already lives in the handle hook, and the cookie scheme is already byte-compatible with the React app (proven by impersonation and logged-in e2e in Phase 3), so this phase adds no session or schema work at all. Nobody gets logged out at cutover.

**Exit gate:** a real Discord login round-trips locally and on a deployed preview, landing in the same session cookie the React app reads.

### Phase 4 — Foundation completion (Fable)

Generalize what the slices proved, before the fleet scales it:

- Finish `route-map` across all 170 routes + the **URL-parity test** (every old URL resolves with the same status code; SvelteKit matchers for the non-filesystem-friendly ones).
- Finish the component library in `packages/components` — the rest of the 108 + 53 components, guided by the same design goal proven in the slices: **progressive enhancement over ARIA maximalism**. Native primitives do the work (react-aria Modal → `<dialog>`, Popover/Menu → popover attribute + anchor positioning, disclosure → `<details>`, Select → `<select>` where design allows); remote forms degrade to plain `<form>` POSTs so mutations work pre-hydration; axe on the showcase keeps the baseline honest without a parity project. Includes the handrolled `VirtualList` (chat messages + long Select option lists — react-aria `Virtualizer`'s only two consumers) and the `use:sortable` dnd action. Each component gets vitest-browser-svelte behavior tests at the level it warrants; `components-showcase` is promoted to the permanent dev harness. Same component names and prop shapes wherever sane, so codemod output stays mechanical.
- Harden the codemods with slice learnings; complete the cookbook's seed entries; set **perf budgets from `performance-audit.md`** (user-card caching re-implemented; the SSR i18n-inlining hack is obsoleted by paraglide); land remaining infra the slices didn't need (cron, img-export plumbing).

### Phase 5 — The fleet (Opus, manifest-driven)

~68 remaining features in dependency-ordered waves:

- **Wave 1 — leaves:** info, links, articles, top-search, badges, splatoon-rotations, object-damage-calculator, …
- **Wave 2 — mid-weight:** builds, analyzer, calendar, art, team, lfg, vods, settings, notifications, user-page, plus-*, …
- **Wave 3 — boss fights:** the tournament cluster, sendouq + sendouq-match (realtime chat), scanner UI. Fable reviews these line-by-line or takes them directly.

Per-feature loop for an Opus agent: run codemods → hand-finish `.svelte` components per cookbook → wire routes → feature e2e green → differential diffs clean → set manifest `verified` → commit. **Escalation rule:** any pattern not in the cookbook stops the agent; Fable rules on it and the book grows. No agent invents a convention.

New-convention ratchets land *before* the fleet: the `no-raw-search-params` / `no-raw-action-forms` Biome plugins are re-authored as ESLint rules covering `.svelte` files, so fleet output is born compliant.

### Phase 6 — Hardening

Full e2e + `flaky-detect` against the Svelte app; full differ sweep; perf-budget comparison per route (expect wins: React+ReactDOM leave the client bundle); a **no-JS smoke suite** — Playwright with JavaScript disabled walking the core read paths and submitting the key forms, cashing in the progressive-enhancement design goal; `api-public` byte-compat check (external consumers must not notice); load test against prod-copy DB.

### Phase 7 — Cutover

Feature-freeze already in effect (Phase 5+). Flip the deploy target. The Svelte app deliberately does **not** include the map planner: at cutover, `planner.sendou.ink` starts serving the still-deployable React app and `/plans` redirects there — the planner keeps working with zero migration effort while doubling as the rollback vehicle. React app stays deployable for a soak window (2–4 weeks) as instant rollback. Rewrite `AGENTS.md`/`docs/dev/*` for the Svelte world (the cookbook largely *becomes* the new AGENTS.md).

### Phase 8 — Planner split (last)

After the soak: trim `apps/web-react` down to `apps/planner` — the map planner + tldraw (~1k lines) and nothing else — deployed standalone at `planner.sendou.ink`. Only then do `apps/web-react` and the differ retire. Doing this last means the planner rides the frozen React app untouched through the entire migration, and its extraction happens with zero time pressure once everything else is proven.

---

## The codemod suite (`tooling/codemods`, ts-morph)

All idempotent, all manifest-aware, all re-runnable while React remains source of truth:

1. **`mono-split`** — moves the app to `apps/web-react` and extracts the few real packages (`tournament-engine` et al) with import rewriting (Phase 0, runs on React code).
2. **`route-map`** — `routes.ts` → SvelteKit route directories + URL-parity manifest.
3. **`remote-scaffold`** — loader files → `query()` scaffolds; action files → per-`_action`-branch `form()`/`command()` scaffolds, wiring in the schemas as converted by `zod-to-valibot`.
4. **`zod-to-valibot`** — wraps valibot's official migration codemod: rewrites a feature's zod schemas to valibot, promotes schemas with 2+ consumers into `@sendou/schemas`, and marks unprovable zod APIs (`z.preprocess`, custom `superRefine`) with `@MIGRATE`.
5. **`jsx-to-svelte`** — the deterministic 80%: `className`→`class` (unwrapping `clsx(...)` calls into Svelte's native clsx-compatible array/object form and dropping the import), ternaries→`{#if}`, `.map()`→`{#each}` (keys from React `key=`), fragments, props→`$props()`, `useState`→`$state`, handler casing, style objects. Anything it can't prove correct becomes an `@MIGRATE` marker with the original JSX preserved in a sidecar comment — that's the Opus hand-finish surface. Deterministic ≠ complete: the codemod's job is to make the LLM's job mechanical and reviewable, not to be a compiler.
6. **`css-inline`** — inlines each component's `.module.css` classes into its `<style>` block, rewrites `styles.foo` → `"foo"` in the template, and flags shared-module classes and cross-component selectors with `@MIGRATE` for the agent to partition.
7. **`manifest`** — ledger updater + progress report.

---

## Risks and things the plan has to absorb

- **Long-lived streaming responses through Cloudflare + Render need a proving spike.** `query.live` holds an open streaming fetch per subscribed tab; proxies can buffer or idle-timeout such connections (heartbeat yields + the built-in reconnect handle most of it, but verify early, in Phase 2, not when chat ships). Also note what we're trading: skalop moved socket load off the app process — with `query.live`, every open tab holds a streaming request against the single Node process. Fine at current scale; if it ever isn't, the escape hatch is sticky-session multi-instance plus a shared pubsub, not a return of the microservice.
- **Remote functions are still experimental — even in Kit 3.** The v3 RC announcement keeps them behind a flag while "ironing out the last few kinks," and the API has already shifted between releases. Mitigation: pin `@sveltejs/kit`, funnel all usage through `SendouForm.svelte` + a small `defineQuery` helper so churn is absorbed in two files. (Starting on the 3 RC itself is low-risk: no further breaking changes are planned before stable, and we're months from cutover anyway.)
- **Lint/format stack (decided): Biome is replaced wholesale by Prettier (`prettier-plugin-svelte`) + ESLint (`eslint-plugin-svelte`, typescript-eslint)** — one stack for `.ts` and `.svelte` alike, no split-brain tooling. The custom Biome plugins (`no-raw-search-params`, `no-raw-action-forms`) are re-authored as ESLint rules before the fleet starts. Long-term we'll evaluate moving to **oxfmt + oxlint** once their Svelte support matures — the custom rules should be written with that portability in mind (keep them thin).
- **TypeScript (decided): step back from 7 to 6 for now.** The repo runs the TS 7 native preview, but svelte-check / svelte language tools and typescript-eslint need a stable TS — pin TS 6 across the workspace for the migration, revisit 7 once the Svelte toolchain supports it.
- **Handwritten components lose react-aria's invisible work** in those 44 files — accepted deliberately: the bar is a solid platform-native baseline plus no-JS resilience, not ARIA parity. The residual risk is *functional* (focus traps, keyboard operability in Combobox/Select), covered by component behavior tests and the advisory structure diff rather than a parity gate.
- **Referential-stability habits from React Compiler** don't translate — Svelte reactivity is fine-grained. The cookbook needs an explicit "don't port memoization workarounds" entry (e.g. the Date.now-in-render pattern gets a proper `$state`-timer idiom).
- **View transitions / toast behavior** — the global toast's `startViewTransition` popover bug is a known trap; re-evaluate on Svelte navigation lifecycle rather than porting the workaround blindly.
- **Seed realism** — differential testing is only as good as the seed's coverage. Routes with states the seed never produces (mid-tournament bracket edge states, ban screens) need seed extensions, or they're silently untested.
- **CI cost doubles** while two apps build and the differ runs. Accept it; it's the price of the oracle, and it's temporary.
- **Feature freeze discipline** — every feature shipped to the React app during Phase 5 is migrated twice. The freeze needs a real start date and a short exception list (bug fixes port to both).

## What "done" means

Per feature: e2e specs green against `apps/web`, pixel + HTML diffs clean (structure diff reviewed), lint ratchets pass, `svelte-autofixer` clean, no `@MIGRATE` or `xxx:` comments left, manifest row `verified`.
Overall: every manifest row verified, hardening suite green, perf budgets met, cutover flipped, soak survived, planner split out to `planner.sendou.ink`, `web-react` deleted.

## Open decisions (sendou's call, before the fleet starts)

1. **Browser-mode test debt** — port all existing vitest browser tests to `vitest-browser-svelte`, or keep only the ones guarding logic the differ can't see. Recommendation: port selectively; the differ covers visual parity better than per-component screenshots.
2. **Freeze date** and how long the rollback soak runs.
