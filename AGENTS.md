## General

- only rarely use comments, prefer descriptive variable and function names (leave existing comments as is).
- if you encounter an existing TODO or xxx comment assume it is there for a reason and do not remove it unless you specifically addressed what the comment is about
- when a comment is needed, brevity is the key, less is more
- task is not considered completely until `bun run checks` passes
- normal file structure has constants at the top immediately followed by the main function body of the file. Helpers are used to structure the code and they are at the bottom of the file (main implementation first, at the top of the file)
- note: any formatting issue (such as tabs vs. spaces) can be resolved by running the `bun run biome:fix` command
- typical way to structure pure logic is into Modules divided by logical domains which are imported with the "* as Module" import and then used like so "Module.foo()". These functions always need JSDoc.
- non-exported functions typically do not need JSDoc or at least it can be kept short
- more topic docs live in `docs/site/src/content/docs/dev/` — notably [architecture.mdx](./docs/site/src/content/docs/dev/architecture.mdx) (feature folder layout), [request-flow.mdx](./docs/site/src/content/docs/dev/request-flow.mdx) (one request followed through every layer), [permissions.mdx](./docs/site/src/content/docs/dev/permissions.mdx) (authorization: global roles via `requireRole()`/`useHasRole()`, per-object `permissions` computed in repositories) and [overlays.mdx](./docs/site/src/content/docs/dev/overlays.mdx) (popovers, menus, selects and dialogs: the floating layer, scroll lock and mobile keyboard handling)

## Commands

- `bun run checks` runs, in order: biome:fix, unit and DOM tests, translation json checks, typecheck (app, scripts and the docs site) and knip — knip means unused exports fail checks, so remove exports nothing imports
- `bun run dev:docs` serves the docs site (`docs/site/`, Astro Starlight, live at https://docs.sendou.ink): the MDX docs of `docs/site/src/content/docs/` plus the living docs generated from the core modules, e2e specs and routes; `bun run docs:capture` refreshes its route coverage and screenshots from an e2e run, see [living-docs.mdx](./docs/site/src/content/docs/dev/living-docs.mdx)
- `bun run typecheck` runs TypeScript type checking
- `bun run biome:fix` runs Biome code formatter and linter
- `bun run test:unit:dom` runs all unit and DOM tests (`bun run test:unit` / `bun run test:dom` for one half)
- `bun run test:e2e` runs all e2e tests
- `bun run test:e2e:flaky-detect` runs all e2e tests and repeats each 10 times
- `bun run i18n:sync` syncs translation jsons with English
- `bun run dev` starts the dev server (also runs migrations and setup first); `bun run seed` rebuilds the dev dataset. The dev admin user ("Sendou") has id 274 (`ADMIN_ID`)
- `bun run dev:tools` talks to a running dev server: `scenario <id> [--param=value]` builds a ready state (e.g. a tournament match to play) and prints a link that logs in as its user, `requests` lists recent requests with their SQL queries, `routine`/`switch` control the server, see [dev-tools.md](./docs/dev/dev-tools.md)

## Runtime

- Bun is the package manager and runs the dev server (`bun --bun react-router dev`), the production server (`server.ts`, `Bun.serve`), the build and the scripts (`bun scripts/foo.ts`; scripts importing app code that uses `import.meta.glob` need `--preload ./scripts/preload.ts`)
- unit tests run on Bun (`bun test`), Playwright runs on Node, so app code reachable from e2e specs must run on both: use web standard APIs and `node:` modules, `Bun.*` only in `server.ts`, scripts and code e2e specs never import (e.g. loaders and actions, which run in the Bun server)
- the dev server only starts fast on Bun thanks to the `@react-router/dev` patch limiting its file watcher; Bun's macOS `fs.watch` gets slower with every watched path

## Typescript

- always use named exports
- Remeda is the utility library of choice
- date-fns should be used for date related logic
- do not use `forEach`, prefer `for...of`

## React

- do not use `useMemo`, `useCallback` unless it is to stabilize a `useEffect` dependency array value
- state management is done via plain `useState` and React Context API
- avoid using `useEffect`
- all texts should be provided translations via the react-i18next library's `useTranslation` hook's `t` function
- instead of `&&` operator for conditional rendering, use the ternary operator; enforced by the `no-and-conditional-rendering` Biome plugin
- for localized user-readable time strings use `<LocaleTime />`, `<LocaleTimeRange>` or `useFormatDistanceToNow`. If needed use `useDateTimeFormat` directly. NEVER use e.g. `toLocaleString` directly as it does not include users' language selection.

## Forms

- forms are built with the `SendouForm` schema-based system: a valibot schema using field builders from `~/form/fields` generates both the UI and server-side validation, see [forms.mdx](./docs/site/src/content/docs/dev/forms.mdx)
- form label/help translations go in `locales/en/forms.json`
- actions are defined with `defineAction` (`~/form/define-action.server`), which parses route params (404 on failure) and the body (`fieldErrors` for SendouForm, error toast otherwise) before the handler runs, see [forms.mdx](./docs/site/src/content/docs/dev/forms.mdx); enforced by the `no-raw-actions` Biome plugin
- fixed-field mutations (an `_action` plus hidden inputs) use `<ActionButton>` which type checks the action and fields against the route's action schema; real multi-input forms instead pass `schema` alongside `_action` to `SubmitButton`; enforced by the `no-raw-action-forms` Biome plugin

## Remix/React Router

- new routes need to be added to `routes.ts`

## Search params

- all URL search param handling goes through `app/modules/search-params/`, see [search-params.mdx](./docs/site/src/content/docs/dev/search-params.mdx) for the conventions
- never use raw `useSearchParams` or `searchParams.get()`; declare params once per feature in a `<feature>-search-params.ts` definition (every param has a default, decode never fails). Enforced by the `no-raw-search-params` Biome plugin
- every definition gets a round-trip test via `assertRoundTrips`

## Web storage

- all `localStorage` / `sessionStorage` access goes through `app/modules/persisted-state/`: declare the value once with `PersistedState.define` (or `defineMap` for a keyed family), typically in a `<feature>-persisted.ts` file, and use `usePersistedState` / `PersistedState.read` / `write`. Enforced by the `no-raw-web-storage` Biome plugin
- every definition gets a round-trip test via `assertRoundTrips` from `persisted-state-test-utils.ts`

## Styling

- use CSS modules
- one file containing React code should have a matching CSS module file e.g. `Component.tsx` should have a file with the same root name i.e. `Component.module.css`
- prefer using [CSS variables](./app/styles/vars.css) for theming
- for any CSS variable used, make sure it is defined either locally or in the `vars.css` file
- for simple styling, prefer [utility classes](./app/styles/utils.css) over creating a new class
- use CSS nesting with the `&` selector to group related selectors (pseudo-classes, pseudo-elements, child selectors, attribute selectors) under their parent instead of repeating the parent selector
- prefer container queries over media queries
- every CSS module is wrapped in a cascade layer by its path (`vite-css-plugins.ts`): `app/components/elements/**` → `elements`, `app/components/*.module.css` → `components`, everything else → `features`. A higher layer always beats a lower one, so a feature can override a shared component's class no matter what order the chunks load in — never reach for `!important` or a specificity hack to win that fight. Two modules in the *same* layer fall back to load order, so a variant of a component's own class (e.g. a divider row of a table) belongs in that component's module, not the caller's.

## SQL

- database is Sqlite3, driven by Node's built-in `node:sqlite` through a custom Kysely dialect (`app/db/node-sqlite-dialect.ts`)
- database code should only be written in Repository files, see [repositories.mdx](./docs/site/src/content/docs/dev/repositories.mdx) for their conventions
- import `jsonArrayFrom`/`jsonObjectFrom`/`jsonBuildObject` from `~/utils/kysely.server`, never from `kysely/helpers/sqlite` (enforced by the `no-kysely-sqlite-helpers` Biome plugin); JSON columns are registered in `app/db/json-columns.ts`
- migrations are Kysely migrations in `/migrations`, scaffolded with `bun run migrate:new "description"` and applied with `bun run migrate up`, see [how-to.mdx](./docs/site/src/content/docs/dev/how-to.mdx)
- down migrations are not needed, only up migrations
- if we are working on a branch by default we should add to the migration this branch added instead of creating a brand new one
- `/app/db/tables.ts` contains all tables and columns available, see [database-schemas.mdx](./docs/site/src/content/docs/dev/database-schemas.mdx) for how columns should be typed (booleans, timestamps, JSON, enums, SQLite migration quirks)
- don't wrap queries in `Promise.all`: `node:sqlite` is synchronous, so they can't run in parallel and it only adds noise; await them one after another
- `db.sqlite3` is development database
- `db-test.sqlite3` is the unit test database (blank sans migrations; gitignored and created/migrated automatically when unit tests run)
- `db-sandbox.sqlite3` is a local, disposable copy of production data. Read, write, migrate, run servers against it or delete it freely — it is not connected to production in any way. `bun run sandbox:reset` restores it
- `db-snapshot.sqlite3` is the pristine source `db-sandbox.sqlite3` is reset from, never modify it

## Unit testing

- unit tests use `bun:test`, run in parallel with every file isolated and without loading `.env`
- console output is only shown for failing tests (`app/test-console.ts`); run with `TEST_LOGS=all` to see all of it
- `vi.mock` is Bun's `mock.module`: not hoisted, so declare what its factory uses above it, and its factory's getters are read once; to change a mocked value mid-file call `vi.mock` again
- what Bun lacks from Vitest (`waitFor`, async timer advancing, mocking `fetch`) is in `~/utils/test-helpers`
- component and hook tests run in happy-dom with Testing Library (`*.dom.test.tsx`); happy-dom has no Popover API, layout, CSS, IndexedDB, canvas or audio, so behaviour depending on those belongs in e2e tests
- name a test after the behaviour it establishes, with no `"should "` prefix (`test("returns null for an unknown id")`)
- `describe` takes the bare function name, except for files consumed through a `* as Module` import, where it takes `Module.fn` — the way callers write it
- when a test is `input -> expected output` with no setup, make it a `test.each` table rather than a run of near-identical `test` blocks; give every row a short label (`$why`, `%s`) so a failure names the case
- test and dev-seed setup writes go through factories, never raw repository/db calls (enforced by the `no-raw-db-writes-in-tests` and `no-raw-db-writes-in-dev-seed` Biome plugins). Factories are setup only: the operation under test is called through its repository directly, never through a factory
- users come from `UserFactory.pool()` declared at module scope and filled in `beforeEach` — never a module-level `let` reassigned per test. Where positions carry meaning, name them with accessors next to the pool (`const actorId = () => users.id(1)`)
- fixture builders shared by more than one test file live in a `tests/` folder of the feature they belong to (`app/features/<feature>/**/tests/fixtures.ts`); don't copy a builder into a second file

## i18n

- by default everything should be translated via i18next
- some a11y labels or text that should not normally be encountered by user (example given, error message by server) can be english
- before adding a new translation, check that one doesn't already exist you can reuse (particularly in the common.json)
- add only English translation, other languages fall back to English until translated (never add empty strings); run `bun run i18n:sync` after removing or renaming keys
- when using namespace e.g. `const { t } = useTranslation(["settings"]);` it needs to be defined in the `handle` for that route e.g. `export const handle: SendouRouteHandle = { i18n: ["settings"], ... }`. Certain namespaces are always included and you don't have to worry about those: "common", "forms", "game-misc", "weapons", "front", "friends"
- if changing translation key names make sure to port over any already translated values for non-english languages if the english language is unchanged

## Changelog

- every user facing change needs a changelog entry, added in the same commit as the change itself. One file per change, a commit can add several. Purely internal work (refactors, dependency bumps, dev tooling, tests) gets none
- entries live at `changelog/YYYY-MM-DD-<slug>.md` and are never deleted, they are the update history
- frontmatter is `type` (`feature` or `bug`) and optionally `navItem`, which picks the icon(s) shown next to the entry: one of `NAV_ICONS` (`app/utils/urls.ts`), or a list of them (`navItem: [calendar, scrims]`) when the change spans several pages. Omitted = the sendou.ink logo. Pick the icon of the page or feature the change is about (`medal` for tournaments, `t` for teams, `u` for user pages). A change to a page with no icon of its own is filed under the closest existing one
- the body is either short (a one line headline) or long (headline followed by a markdown bullet list, for a big feature release)
- write them for users and not developers: what changed for them, not how it was implemented

```md
---
navItem: plans
type: feature
---
Map planner improvements

- Plans are saved and restored when you come back to the page
- Undo & redo are back, now in the toolbar
```

- on update day these become the image posted on social media, see [how-to.mdx](./docs/site/src/content/docs/dev/how-to.mdx)

## Scanner feature (app/features/scanner)

- computer-vision match-event detection; full docs in `docs/site/src/content/feature-readmes/scanner.mdx` — read it before touching detector/recognition code
- OpenCV ROI-view gotcha: `.data`/`.clone()` are broken on ROI views — always `view.copyTo(freshMat)` before pixel access
- fixture workflow: every live misread becomes a fixture under `app/features/scanner/tests/fixtures/`; ground-truth labels are hand-corrected by the maintainer and definitive over any matcher output
- test with `bun run test:scanner`; accuracy report with `bun run scanner:report`; atlas regen commands and the assets-repo/CDN flow are in the README
- events, snap tables, and fixtures speak sendou ids (`ModeShort`/`StageId`/weapon ids/`Ability`) — never reintroduce English game-name literals outside the generated localized snap tables
