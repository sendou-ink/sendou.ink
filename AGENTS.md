## General

- only rarely use comments, prefer descriptive variable and function names (leave existing comments as is).
- if you encounter an existing TODO or xxx comment assume it is there for a reason and do not remove it unless you specifically addressed what the comment is about
- when a comment is needed, brevity is the key, less is more
- task is not considered completely until `pnpm run checks` passes
- normal file structure has constants at the top immediately followed by the main function body of the file. Helpers are used to structure the code and they are at the bottom of the file (main implementation first, at the top of the file)
- note: any formatting issue (such as tabs vs. spaces) can be resolved by running the `pnpm run biome:fix` command
- typical way to structure pure logic is into Modules divided by logical domains which are imported with the "* as Module" import and then used like so "Module.foo()". These functions always need JSDoc.
- non-exported functions typically do not need JSDoc or at least it can be kept short
- more topic docs live in `docs/dev/` — notably [architecture.md](./docs/dev/architecture.md) (feature folder layout) and [permissions.md](./docs/dev/permissions.md) (authorization: global roles via `requireRole()`/`useHasRole()`, per-object `permissions` computed in repositories)

## Commands

- `pnpm run checks` runs, in order: biome:fix, unit/browser tests, translation json checks, typecheck and knip — knip means unused exports fail checks, so remove exports nothing imports
- `pnpm run typecheck` runs TypeScript type checking
- `pnpm run biome:fix` runs Biome code formatter and linter
- `pnpm run test:unit:browser` runs all unit tests and browser tests
- `pnpm run test:e2e` runs all e2e tests
- `pnpm run test:e2e:flaky-detect` runs all e2e tests and repeats each 10 times
- `pnpm run i18n:sync` syncs translation jsons with English
- `pnpm run dev` starts the dev server (also runs migrations and setup first); `pnpm run seed` rebuilds the dev dataset. The dev admin user ("Sendou") has id 274 (`ADMIN_ID`)

## Typescript

- always use named exports
- Remeda is the utility library of choice
- date-fns should be used for date related logic
- do not use `forEach`, prefer `for...of`

## React

- do not use `useMemo`, `useCallback` unless it is to stabilize a `useEffect` dependency array value
- state management is done via plain `useState` and React Context API
- avoid using `useEffect`
- all texts should be provided translations via the i18next library's `useTranslations` hook's `t` function
- instead of `&&` operator for conditional rendering, use the ternary operator
- for localized user-readable time strings use `<LocaleTime />`, `<LocaleTimeRange>` or `useFormatDistanceToNow`. If needed use `useDateTimeFormat` directly. NEVER use e.g. `toLocaleString` directly as it does not include users' language selection.

## Forms

- forms are built with the `SendouForm` schema-based system: a valibot schema using field builders from `~/form/fields` generates both the UI and server-side validation, see [forms.md](./docs/dev/forms.md)
- form label/help translations go in `locales/en/forms.json`
- fixed-field mutations (an `_action` plus hidden inputs) use `<ActionButton>` which type checks the action and fields against the route's action schema; real multi-input forms instead pass `schema` alongside `_action` to `SubmitButton`; enforced by the `no-raw-action-forms` Biome plugin

## Remix/React Router

- new routes need to be added to `routes.ts`

## Search params

- all URL search param handling goes through `app/modules/search-params/`, see [search-params.md](./docs/dev/search-params.md) for the conventions
- never use raw `useSearchParams` or `searchParams.get()`; declare params once per feature in a `<feature>-search-params.ts` definition (every param has a default, decode never fails). Enforced by the `no-raw-search-params` Biome plugin
- every definition gets a round-trip test via `assertRoundTrips`

## Styling

- use CSS modules
- one file containing React code should have a matching CSS module file e.g. `Component.tsx` should have a file with the same root name i.e. `Component.module.css`
- prefer using [CSS variables](./app/styles/vars.css) for theming
- for any CSS variable used, make sure it is defined either locally or in the `vars.css` file
- for simple styling, prefer [utility classes](./app/styles/utils.css) over creating a new class
- use CSS nesting with the `&` selector to group related selectors (pseudo-classes, pseudo-elements, child selectors, attribute selectors) under their parent instead of repeating the parent selector
- prefer container queries over media queries
- every CSS module is wrapped in a cascade layer by its path (`vite.config.ts`): `app/components/elements/**` → `elements`, `app/components/*.module.css` → `components`, everything else → `features`. A higher layer always beats a lower one, so a feature can override a shared component's class no matter what order the chunks load in — never reach for `!important` or a specificity hack to win that fight. Two modules in the *same* layer fall back to load order, so a variant of a component's own class (e.g. a divider row of a table) belongs in that component's module, not the caller's.

## SQL

- database is Sqlite3, driven by Node's built-in `node:sqlite` through a custom Kysely dialect (`app/db/node-sqlite-dialect.ts`)
- database code should only be written in Repository files, see [repositories.md](./docs/dev/repositories.md) for their conventions
- import `jsonArrayFrom`/`jsonObjectFrom`/`jsonBuildObject` from `~/utils/kysely.server`, never from `kysely/helpers/sqlite` (enforced by the `no-kysely-sqlite-helpers` Biome plugin); JSON columns are registered in `app/db/json-columns.ts`
- migrations are Kysely migrations in `/migrations`, scaffolded with `pnpm run migrate:new "description"` and applied with `pnpm run migrate up`, see [how-to.md](./docs/dev/how-to.md)
- down migrations are not needed, only up migrations
- if we are working on a branch by default we should add to the migration this branch added instead of creating a brand new one
- `/app/db/tables.ts` contains all tables and columns available, see [database-schemas.md](./docs/dev/database-schemas.md) for how columns should be typed (booleans, timestamps, JSON, enums, SQLite migration quirks)
- `db.sqlite3` is development database
- `db-test.sqlite3` is the unit test database (blank sans migrations; gitignored and created/migrated automatically when unit tests run)
- `db-prod.sqlite3` is a copy of the production environment db which can be freely experimented with

## Unit testing

- library used for unit testing is Vitest
- Vitest browser mode can be used to write tests for components
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
- add only English translation and use `pnpm run i18n:sync` to initialize other jsons with empty string ready for translators
- when using namespace e.g. `const { t } = useTranslation("settings"]);` it needs to be defined in the `handle` for that route e.g. `export const handle: SendouRouteHandle = { i18n: ["settings"], ... }`. Certain namespaces are always included and you don't have to worry about those: "common", "forms", "game-misc", "weapons", "front", "friends"
- if changing translation key names make sure to port over any already translated values for non-english languages if the english language is unchanged

## Changelog

- every user facing change needs a changelog entry, added in the same commit as the change itself. One file per change, a commit can add several. Purely internal work (refactors, dependency bumps, dev tooling, tests) gets none
- entries live at `changelog/YYYY-MM-DD-<slug>.md` and are never deleted, they are the update history
- frontmatter is `type` (`feature` or `bug`) and optionally `navItem`, which picks the icon(s) shown next to the entry: one of `OG_IMAGE_PAGES` (`app/utils/urls.ts`), or a list of them (`navItem: [calendar, scrims]`) when the change spans several pages. Omitted = the sendou.ink logo. A change to a page with no nav item of its own is filed under the closest existing one
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

- on update day these become the image posted on social media, see [how-to.md](./docs/dev/how-to.md)

## Commits

- do not mention claude or claude code
- unless specifically instructed, do not create new branches

## Pull request

- use the template `/github/pull_request_template.md`
- do not mention claude or claude code in the description

## Scanner feature (app/features/scanner)

- computer-vision match-event detection; full docs in `app/features/scanner/README.md` — read it before touching detector/recognition code
- OpenCV ROI-view gotcha: `.data`/`.clone()` are broken on ROI views — always `view.copyTo(freshMat)` before pixel access
- fixture workflow: every live misread becomes a fixture under `app/features/scanner/tests/fixtures/`; ground-truth labels are hand-corrected by the maintainer and definitive over any matcher output
- test with `pnpm test:scanner`; accuracy report with `pnpm scanner:report`; atlas regen commands and the assets-repo/CDN flow are in the README
- events, snap tables, and fixtures speak sendou ids (`ModeShort`/`StageId`/weapon ids/`Ability`) — never reintroduce English game-name literals outside the generated localized snap tables
