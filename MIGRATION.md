# Migration cookbook

The pattern book for the React → Svelte migration (`svelte-big-bang.md`). Every
recurring pattern gets a before/after entry here; migrating agents follow the
book and never improvise. A pattern missing from the book is an escalation —
the resolution becomes a new entry. Entries are born in the vertical slices
(`/leaderboards` first) and grow from there.

Conventions used by every entry:

- `apps/web` imports its own code via `#lib/...` subpath imports **with explicit
  file extensions** (`#lib/utils/urls.ts`, `#lib/components/Main.svelte`) — Kit 3
  subpath imports are unambiguous or they don't resolve.
- Server-only code: `*.server.ts` filename suffix, or anything under
  `src/lib/server/`. Remote functions: `<feature>.remote.ts`.
- One component per `.svelte` file; feature components live in
  `src/lib/features/<feature>/components/`, generic primitives in
  `@sendou/components` (`packages/components`), app-wide pieces in
  `src/lib/components/`.
- Route files are thin shells: a `+page.svelte` composes feature components and
  wires meta tags; everything real lives in the feature folder.

---

## Read path (loader → remote query)

The golden pattern, from `/leaderboards`.

**Before** (React Router): `loaders/leaderboards.server.ts` exports a `loader`
that parses search params from the request URL and returns data;
`useLoaderData()` in the route component.

**After** (SvelteKit): the loader body becomes a `query()` in
`leaderboards.remote.ts`. Remote queries cannot read the URL — the page parses
the URL client/SSR-side and passes the decoded values as query args, validated
by a valibot schema:

```ts
// leaderboards.remote.ts
import { query } from "$app/server";
import { getUser } from "#lib/features/auth/user.server.ts";
import { leaderboardsQuerySchema } from "./leaderboards-schemas.ts";

export const getLeaderboards = query(
	leaderboardsQuerySchema,
	async ({ type, season }) => {
		const user = getUser(); // event.locals via getRequestEvent()
		// ...same body as the React loader
	},
);
```

```svelte
<!-- Leaderboards.svelte -->
<script lang="ts">
	const params = searchParamsState(leaderboardsSearchParams);
	const data = $derived(await getLeaderboards(params.current));
</script>
```

`$derived(await ...)` needs `compilerOptions.experimental.async` (on). When the
params change the derived re-awaits; identical args hit the query cache, so a
URL write that decodes to the same values refetches nothing — this replaces the
React `shouldRevalidate` machinery entirely.

Auth: `requireUser()` / `getUser()` / `actorId()` from
`#lib/features/auth/user.server.ts` read `event.locals.user`, resolved once per
request in `hooks.server.ts`. No AsyncLocalStorage.

## Write path (action → command), the golden pattern

From the `/scrims` slice (`scrims.remote.ts`):

- Each `_action` branch of a React action union becomes its own `command()`
  with its own valibot schema (the `_action` discriminator disappears).
- **Single-flight refresh**: the client rides the refresh on the mutation round
  trip by passing the query *function* — `acceptScrimRequest(args)
  .updates(getScrimPosts)` — and the handler fulfils it with
  `await requested(getScrimPosts, 5).refreshAll()`. Kit resolves the client's
  active instances of that query (whatever args they hold), re-runs them
  server-side, and the fresh data rides back on the command response.
- Mutations that live queries observe skip `.updates()` entirely: the handler
  publishes to the event bus (`Events.publish(Events.scrimChannel(id))`) and
  every subscribed stream — including the actor's own tab — re-yields.
- React's `errorToast`/`errorToastIfFalsy`/`notFoundIfNullish` port as
  `#lib/utils/respond.server.ts` (they `error(400/404, message)` the command).
  Handlers that used `{ fieldErrors }` returns keep them — `SendouForm` shows
  them under the fields.
- `requirePermission(obj, permission)` is ported in
  `#lib/modules/permissions/guards.server.ts`.

## SendouForm (schema-driven forms)

`~/form/` ports as `#lib/form/`: `SendouForm.svelte`, `FormField.svelte`
(dispatch by schema metadata), `fields.ts` (valibot builders + a WeakMap
registry replacing zod's `formRegistry`), per-type field components in
`fields/`. The React data flow is kept — values in `$state`, client-side
valibot validation with translated `forms:*` message keys, submit sends the
raw values — but the transport is a remote **command whose arg schema is the
form schema** (server-side validation for free). Kit's remote `form()` stays
for simple fixed-field forms (the sidenav pattern); the complex fields (Date
values, tuple/union shapes) don't fit its FormData-backed field model, and
these forms were JS-dependent in React too.

- Page wiring: `onSubmit={async (values) => { const r = await
  createScrimPost(values as v.InferInput<typeof schema>); if (r?.fieldErrors)
  return r; await goto(...); }}` plus `onSuccess` for closing dialogs.
- Cross-field `superRefine` → `v.pipe(v.object(...), v.transform(...),
  v.forward(v.check(...), [path]), ...)`; `.overwrite` → `v.transform` in the
  same pipe.
- Fields render through context (`form-context.ts`); custom fields are
  `<FormField name="x">{#snippet children(props)}...{/snippet}</FormField>`
  with the same `CustomFieldRenderProps` contract as React.
- The unsaved-changes guard is `#lib/form/UnsavedChangesGuard.svelte` in the
  root layout + a `registerDirtyChecker` registry (`beforeNavigate` replaces
  `useBlocker`; a `willUnload` cancel triggers the native prompt).
- `DatePicker.svelte` replaces react-aria's DatePicker: contenteditable
  `spinbutton` segments named `"{segment}, {label}"` (the e2e contract), built
  from `Intl.DateTimeFormat.formatToParts`. Segment quirks that pixel parity
  depends on: no `white-space: pre` (flex whitespace collapsing is what glues
  react-aria's literals), no explicit font-size (inherits like react-aria),
  month/day/hour unpadded, minute 2-digit.

## Live queries (`query.live`) + the event bus

- `#lib/server/events.ts` is the in-process bus: mutations `publish(channel)`,
  live-query generators `for await (const _ of Events.subscribe(channel))`
  re-yield a fresh snapshot per (coalesced) wake-up. Always snapshots, never
  event logs. A built-in heartbeat keeps proxies from idle-closing streams.
- Live queries stream over GET + SSE — they never interfere with the e2e
  helpers' POST waits, and `fetch()` resolving on headers keeps the
  hydration-indicator busy counter honest.
- SSR awaits the stream's first value; generators must yield before blocking
  on the bus.
- Consumers: `getNotifications` (bell, per-user channel), `getChatRoom`/
  `getChatRooms` (chat), `getScrim` (both teams' scrim pages update live —
  replaces skalop's revalidation broadcasts).

Never leave a mutation without a refresh story — the refresh-everything
default must not ship.

## Search params

`app/modules/search-params` is ported at
`#lib/modules/search-params/search-params.ts` with valibot schemas
(`SP.param(v.picklist(...))` etc.). Component state comes from
`searchParamsState(definition)` (`search-params-state.svelte.ts`):
`params.current` is reactive to the URL; `params.set(updates)` writes through a
replace navigation (`goto` with `reset: false`), shallow for `loader: false`
params. Every definition still registers an `assertRoundTrips` test.

`SP.custom` takes an explicit `ParamCodec` (`{ decode, encode }`) instead of a
zod codec.

## Validation (zod → valibot)

- `z.enum([...])` → `v.picklist([...])`
- `z.number().int().min(1)` → `v.pipe(v.number(), v.integer(), v.minValue(1))`
- `z.string().regex(...).pipe(z.custom<T>())` →
  `v.pipe(v.string(), v.regex(...), v.transform((s) => s as T))`
- `.nullable()` → `v.nullable(...)`
- Schemas with 2+ consumers get promoted to `@sendou/schemas` (none yet).

## Components

| React | Svelte |
|---|---|
| `useState` | `$state` |
| derived-in-render | `$derived` / `$derived.by` |
| `useEffect` | usually delete; else `$effect` |
| props / `children` / render props | `$props()` / snippets (`{@render children()}`) |
| `clsx(...)` in `className` | `class={[ ... ]}` array form (built-in clsx) |
| `React.cloneElement(icon, {className})` | wrapper `<span class="...">{@render icon()}</span>` + `:global(svg)` sizing |
| ref callbacks | `{@attach fn}` attachments (return value = cleanup) |
| `useHydrated()` | `browser` from `$app/env`, or just render client-only branches after an `$effect` sets a flag |
| controlled/uncontrolled prop pairs | same pattern; mark the mount-time branch with `svelte-ignore state_referenced_locally` |
| module-level caches keyed by `i18n.language` | usually unnecessary — paraglide messages are plain function calls |
| react-aria `Tabs/TabList/Tab/TabPanel` | `@sendou/components` `Tabs/TabList/Tab/TabPanel` (handrolled ARIA tabs, context-based) |
| react-aria `MenuTrigger/Menu/MenuItem` | `@sendou/components` `Menu/MenuItem` — trigger is a snippet receiving `{ "aria-expanded", "aria-haspopup", onclick }` to spread |
| react-aria `DialogTrigger/Popover/Dialog` | `@sendou/components` `Popover`, same trigger-snippet contract |
| react-aria `Select` + `Autocomplete` + `Virtualizer` | `@sendou/components` `Select/SelectItem/SelectItemSection` — filtering happens at the **data level** in the caller (see `WeaponSelect.svelte`), no virtualization (a few hundred items render fine) |
| `useLoaderData()` | `await query()` (see read path) |
| `<Link to>` | plain `<a href>` |
| `useUser()` / `useHasRole()` | `loggedInUser()` / `hasRole()` from `#lib/features/auth/user-state.ts` (reads `page.data.user`) |
| meta functions | `<MetaTags …/>` (`#lib/components/MetaTags.svelte`) inside the `+page.svelte` |

## CSS

- Each component's `.module.css` contents move into its `<style>` block
  verbatim; `styles.foo` references become plain `class="foo"`.
- **Shared module classes** (one `.module.css` imported by several components,
  e.g. the leaderboard table styles from `top-search.module.css`): the shared
  markup and its styles become **one component file with exported snippets**
  (`#lib/components/PlacementsTable.svelte` — the default export is the `.table`
  wrapper component; the row pieces (`placementRow`, `placementName`,
  `placementTierHeader`, `placementDivider`) are snippets exported from
  `<script module>`). Snippet markup keeps the scope hash of the file that
  defines it, so the styles stay plainly scoped, and consumers import the
  snippets instead of duplicating rules or reaching across components with
  `:global`. (The first `/leaderboards` port instead globalized the whole
  stylesheet in the parent — `.leaderboards :global(.tableRow)` — which is the
  anti-pattern; it was reworked to this.)
- `:global(...)` stays an escape hatch for two cases only, always
  ancestor-scoped: a class forwarded into another component's markup
  (`.tableInnerRow :global(.tableWeapon)` for a `class` prop landing inside
  `WeaponImage`), and cross-component selectors inside one logical component
  family (`Tabs.svelte` styling `.tabList`/`.tabContainer` rendered by its
  children).
- Global styles (`vars.css`, `utils.css`, `normalize.css`, `common.css`,
  `flags.css`, `fonts.css`) are imported once in `+layout.svelte`.
- A `<Main className="stack lg">` in React becomes `<Main>` wrapping a
  `<div class="stack lg">`. Visually identical; noted for the differ.

## i18n

- `t("ns:some.key")` → `m.ns_some_key()` (`import { m } from
  "#lib/paraglide/messages.js"`): namespace prefix + dots/dashes → underscores.
- Dynamic key families (weapon names by id, mode names) go through the typed
  helpers in `#lib/modules/i18n/messages.ts` (`mainWeaponName(id)`,
  `modeLongName(mode)`, `weaponCategoryName(name)`, or `dynamicMessage(key)`).
- Current language: `getLocale()` from `#lib/paraglide/runtime.js` (replaces
  `i18n.language`).
- `handle.i18n` namespace lists are gone — messages are tree-shaken imports.

## Infra

- Session cookies (`__session`, `theme`, `sidenav`) are byte-compatible with
  the React app: `readSessionCookie`/`writeSessionCookie` in
  `#lib/features/auth/session.server.ts` reimplement React Router's
  base64-JSON + HMAC-SHA256 format with the same `SESSION_SECRET`.
- Repository files port verbatim: only the import paths change
  (`~/db/sql` → `#lib/server/db/sql.ts`, `~/utils/kysely.server` →
  `#lib/server/kysely.ts`, `~/utils/dates` → `#lib/utils/dates.ts`).
- `#lib/server/db/tables.ts` is a **trimmed** copy of the React `tables.ts` —
  it grows with each migrated feature; copy table interfaces verbatim, omit
  columns whose payload types would drag in unported feature graphs (they get
  added back when that feature migrates).
- cachified + the LRU cache work unchanged (`#lib/server/cache.ts`).
- Dev-controls endpoints (`/auth/impersonate`, `/theme`, `/refresh-caches`,
  `/end-season`, `/run-routine`, `/sidenav`) are `+server.ts` route handlers
  gated on `DANGEROUS_CAN_ACCESS_DEV_CONTROLS`.
- The e2e/differ app contract (`data-testid="hydrated"`, `data-router-idle`)
  is `#lib/components/HydrationTestIndicator.svelte`, rendered under
  `IS_E2E_TEST_RUN` only; it counts in-flight remote fetches for the busy
  state.

## Popovers, menus, selects (mount semantics)

react-aria unmounts popover/menu content when closed; the handwritten
`Popover`/`Menu` components now do the same (`{#if open}` around children).
This is what keeps strict-mode e2e selectors (and ARIA snapshots) from seeing
N hidden copies of testids/labels. `Select` keeps its *items* mounted (the
trigger text comes from item registration) but mounts the search field only
while open; its listbox is labelled only while open so a closed select exposes
exactly one element under its label. Search-item locators in the e2e helpers
filter `{ visible: true }` for the same reason.

Icon-only buttons: React applies the size classes to the icon element itself
(an 18px icon inside the 20px slot ends up 20×18); the Svelte `Button` wraps
icons in a span whose `svg { width: 100%; height: auto }` wins on specificity.
Where parity matters, out-specify it with a tripled class
(`:global(.x.x.x) { height: 18px; }`) — see `ScrimTeamMembersPopover.svelte`.

## One-offs ledger (discoveries)

- Kit 3 moved `Handle` to `@sveltejs/kit/hooks` and `getRequestEvent` to
  `$app/server`; `event.request` is read-only in handle hooks (paraglide's
  middleware pattern of reassigning it is unnecessary without URL locale
  strategies).
- React's `/theme` GET responds with a 404-status redirect — kept verbatim via
  a manual `Response` (Kit's `redirect()` only allows 3xx).
- The differ impersonates with `maxRedirects: 0` so the redirect target may be
  a not-yet-migrated route.
- Numeric `width`/`height` on `<img>` are set through the DOM property setters
  on hydration, which truncate fractions (`27.76` → `27`, an 1px layout shift
  vs React per image). Pass dimension attributes as strings when they can be
  fractional — `Image.svelte` does this for all its images.
- SvelteKit 3 + adapter-node derive the CSRF/remote-function self-origin from
  proxy headers, guessing `https://` bare; e2e builds set
  `paths.origin` + `csrf.trustedOrigins: ["*"]` (see `vite.config.ts`) or every
  tooling/e2e form POST is rejected 403.
- `top-search.module.css` had two consumers in React (leaderboards +
  top-search's `Placements.tsx`). Its classes now live in
  `PlacementsTable.svelte`; when the top-search slice migrates, `Placements`
  imports those snippets, and the two classes leaderboards doesn't use
  (`.tableMode`, `.time`) get added to `PlacementsTable.svelte` at that point.
- `apps/web` sets `envDir: "../web-react"` (vite.config.ts): `Config` values
  are baked from `VITE_*` at build time, and without it the Svelte builds saw
  no `.env` at all — the differ caught `VITE_TOURNAMENT_DEFAULT_LOGO` falling
  back to `.avif` while the oracle baked `.png` from `apps/web-react/.env`
  (broken sidebar event logos). One shared `.env` is the source of truth until
  the cutover; tooling overrides passed via `process.env` still win over it.
- Kit 3 param matchers are Standard Schemas in a single `src/params.ts`
  exporting `params = defineParams({ integer: v.pipe(v.string(),
  v.regex(/^\d+$/)) })` — the `src/params/<name>.ts` convention is gone.
- Files named `*.remote.server.ts` are treated as remote-function modules by
  Kit (everything exported must be a remote function) — hence
  `#lib/utils/respond.server.ts`, not `remote.server.ts`.
- adapter-node 6 bakes `ORIGIN` (from `paths.origin`) at build time, and a
  bare request guesses `https://`. One e2e/differ build serves many worker
  ports, so the tooling spawns `apps/web/scripts/e2e-server.mjs` — a shim that
  injects `x-forwarded-proto: http` with `PROTOCOL_HEADER` set — and
  remote-function CSRF (which ignores `csrf.trustedOrigins`) sees the right
  per-port origin.
- Context in async components must be set *before* the first `await`
  (`set_context_after_init` is fatal in prod). Pattern: `setUserCardContext({
  userCards: () => data.userCards })` above `const data = $derived(await …)` —
  the getter only runs after the await resolves.
- Mutating `$state` synchronously inside a `$derived`-triggered fetch is a
  `state_unsafe_mutation` — the e2e fetch-counter patch defers its counter
  writes a microtask (`HydrationTestIndicator.svelte`).
- Routes without their own meta render `<DefaultMetaTags />` — the React root
  supplies default title/description/og tags to meta-less routes, and the SSR
  head diff flags their absence.
- The census walk must use an index entry's own `path` (from `prefix()`);
  `/scrims` was silently missing from the census before.
- `RENDER_GIT_COMMIT` comes from `apps/web-react/.env` via `loadEnv` in
  vite.config (plain `process.env` misses it and the footer loses its Version
  line — a differ pixel diff).
- `notify`/`resolveNotifications` port to
  `#lib/features/notifications/core/`, publishing to per-user bus channels
  instead of skalop pings; web push is still unported (`xxx:` in
  `notify.server.ts`).
