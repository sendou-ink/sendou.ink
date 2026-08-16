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

## Write path (action → command), first shape

The full write-path pattern lands with the `/scrims` slice; `/leaderboards`
established the command shape for fixed-field mutations:

- Each `_action` branch of a React action union becomes its own `command()`
  with its own valibot schema (the `_action` discriminator disappears).
- **Server-driven refresh is the default**: the handler calls
  `getX(args).refresh()` / `.set(result)` for exactly the queries it
  invalidated.
- When the server genuinely can't know which query instance the client holds
  (filter/pagination args — the leaderboards case), the **client** rides the
  refresh on the mutation round trip instead:

```ts
skipTeam({ season, identifier }).updates(getLeaderboards(queryArgs));
```

Never leave a mutation without one of the two — the refresh-everything default
must not ship.

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
  e.g. the leaderboard table styles from `top-search.module.css`): declare them
  once in the feature's top component under a scoped wrapper class with
  `:global(...)` descendants (`.leaderboards :global(.tableRow) { ... }`);
  child components just use the plain class names. Same technique for
  cross-component selectors inside one logical component family
  (`Tabs.svelte` styling `.tabList`/`.tabContainer` rendered by its children).
- Global styles (`vars.css`, `utils.css`, `normalize.css`, `common.css`,
  `flags.css`, `fonts.css`) are imported once in `+layout.svelte`.
- A `<Main className="stack lg">` in React becomes `<Main>` wrapping a
  `<div class="stack lg <feature>">` — the wrapper also carries the feature's
  scoped `:global` styles. Visually identical; noted for the differ.

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
