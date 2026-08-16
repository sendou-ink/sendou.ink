## Monorepo layout

- pnpm workspace (Phase 0 of `svelte-big-bang.md`): the React app lives in `apps/web-react/` — every `app/...`, `e2e/...`, `scripts/...`, `locales/...`, `migrations/...` path below is relative to it
- `packages/` holds extracted libraries (`@sendou/in-game-lists`, `@sendou/tournament-engine`, `@sendou/utils`, `@sendou/build-analyzer`, `@sendou/map-list-generator`, `@sendou/scanner-core`); never import them via relative paths, always via the package name
- `tooling/codemods/` has the migration codemods and the `migration-manifest.json` updater; `pnpm run <script>` at the repo root delegates to `apps/web-react`, so root commands keep working as documented

## General

- only rarely use comments, prefer descriptive variable and function names (leave existing comments as is).
- if you encounter an existing TODO comment assume it is there for a reason and do not remove it
- task is not considered completely until `pnpm run checks` passes
- normal file structure has constants at the top immediately followed by the main function body of the file. Helpers are used to structure the code and they are at the bottom of the file (main implementation first, at the top of the file)
- note: any formatting issue (such as tabs vs. spaces) can be resolved by running the `pnpm run biome:fix` command
- typical way to structure pure logic is into Modules divided by logical domains which are imported with the "* as Module" import and then used like so "Module.foo()". These functions always need JSDoc.
- non-exported functions typically do not need JSDoc or at least it can be kept short

## Commands

- `pnpm run typecheck` runs TypeScript type checking
- `pnpm run biome:fix` runs Biome code formatter and linter
- `pnpm run test:unit:browser` runs all unit tests and browser tests
- `pnpm run test:e2e` runs all e2e tests
- `pnpm run test:e2e:flaky-detect` runs all e2e tests and repeats each 10 times
- `pnpm run i18n:sync` syncs translation jsons with English 

## Typescript

- prefer early return over nesting if statements (bouncer pattern)
- do not use `any` type
- for constants use ALL_CAPS
- always use named exports
- Remeda is the utility library of choice
- date-fns should be used for date related logic
- do not use `forEach`, prefer `for...of`

## React

- prefer functional components over class components
- prefer using hooks over class lifecycle methods
- do not use `useMemo`, `useCallback` unless it is to stabilize a `useEffect` dependency array value
- state management is done via plain `useState` and React Context API
- avoid using `useEffect`
- split bigger components into smaller ones
- one file can have many components
- all texts should be provided translations via the i18next library's `useTranslations` hook's `t` function
- instead of `&&` operator for conditional rendering, use the ternary operator
- fixed-field mutations (an `_action` plus hidden inputs) use `<ActionButton>` which type checks the action and fields against the route's zod action schema; real multi-input forms instead pass `schema` alongside `_action` to `SubmitButton`; enforced by the `no-raw-action-forms` Biome plugin
- for localized user-readable time strings use `<LocaleTime />`, `<LocaleTimeRange>` or `useFormatDistanceToNow`. If needed use `useDateTimeFormat` directly. NEVER use e.g. `toLocaleString` directly as it does not include users' language selection.

## Remix/React Router

- new routes need to be added to `routes.ts`

## Search params

- all URL search param handling goes through `app/modules/search-params/`, see [search-params.md](./docs/dev/search-params.md) for the conventions
- never use raw `useSearchParams` or `searchParams.get()`; declare params once per feature in a `<feature>-search-params.ts` definition (every param has a default, decode never fails). Enforced by the `no-raw-search-params` Biome plugin
- every definition gets a round-trip test via `assertRoundTrips`

## Styling

- use CSS modules
- one file containing React code should have a matching CSS module file e.g. `Component.tsx` should have a file with the same root name i.e. `Component.module.css`
- clsx library is used for conditional class names
- prefer using [CSS variables](./app/styles/vars.css) for theming
- for any CSS variable used, make sure it is defined either locally or in the `vars.css` file
- for simple styling, prefer [utility classes](./app/styles/utils.css) over creating a new class
- use CSS nesting with the `&` selector to group related selectors (pseudo-classes, pseudo-elements, child selectors, attribute selectors) under their parent instead of repeating the parent selector
- prefer container queries over media queries

## SQL

- database is Sqlite3, driven by Node's built-in `node:sqlite` through a custom Kysely dialect (`app/db/node-sqlite-dialect.ts`)
- database code should only be written in Repository files, see [repositories.md](./docs/dev/repositories.md) for their conventions
- migrations are Kysely migrations in `/migrations`, scaffolded with `pnpm run migrate:new "description"` and applied with `pnpm run migrate up`, see [how-to.md](./docs/dev/how-to.md)
- down migrations are not needed, only up migrations
- every database id is of type number
- if we are working on a branch by default we should add to the migration this branch added instead of creating a brand new one
- `/app/db/tables.ts` contains all tables and columns available, see [database-schemas.md](./docs/dev/database-schemas.md) for how columns should be typed (booleans, timestamps, JSON, enums, SQLite migration quirks)
- `db.sqlite3` is development database
- `db-test.sqlite3` is the unit test database (blank sans migrations; gitignored and created/migrated automatically when unit tests run)
- `db-prod.sqlite3` is a copy of the production environment db which can be freely experimented with

## Unit testing

- library used for unit testing is Vitest
- Vitest browser mode can be used to write tests for components
- use `test`, not `it`
- name a test after the behaviour it establishes, with no `"should "` prefix (`test("returns null for an unknown id")`)
- `describe` takes the bare function name, except for files consumed through a `* as Module` import, where it takes `Module.fn` — the way callers write it
- when a test is `input -> expected output` with no setup, make it a `test.each` table rather than a run of near-identical `test` blocks; give every row a short label (`$why`, `%s`) so a failure names the case
- users come from `UserFactory.pool()` declared at module scope and filled in `beforeEach` — never a module-level `let` reassigned per test. Where positions carry meaning, name them with accessors next to the pool (`const actorId = () => users.id(1)`)
- fixture builders shared by more than one test file live in a `tests/` folder of the feature they belong to (`app/features/<feature>/**/tests/fixtures.ts`); don't copy a builder into a second file

## i18n

- by default everything should be translated via i18next
- some a11y labels or text that should not normally be encountered by user (example given, error message by server) can be english
- before adding a new translation, check that one doesn't already exist you can reuse (particularly in the common.json)
- add only English translation and use `pnpm run i18n:sync` to initialize other jsons with empty string ready for translators
- when using namespace e.g. `const { t } = useTranslation("settings"]);` it needs to be defined in the `handle` for that route e.g. `export const handle: SendouRouteHandle = { i18n: ["settings"], ... }`. Certain namespaces are always included and you don't have to worry about those: "common", "forms", "game-misc", "weapons", "front", "friends"
- if changing translation key names make sure to port over any already translated values for non-english languages if the english language is unchanged

## Commits

- do not mention claude or claude code
- unless specifically instructed, do not create new branches

## Pull request

- use the template `/github/pull_request_template.md`
- do not mention claude or claude code in the description

## Scanner feature (app/features/scanner)

- computer-vision match-event detection; full docs in `app/features/scanner/README.md` — read it before touching detector/recognition code
- the detection core lives in the `@sendou/scanner-core` workspace package (`packages/scanner-core`); capture, UI, Node helpers, tests, and fixtures stay in the feature folder
- OpenCV ROI-view gotcha: `.data`/`.clone()` are broken on ROI views — always `view.copyTo(freshMat)` before pixel access
- fixture workflow: every live misread becomes a fixture under `app/features/scanner/tests/fixtures/`; ground-truth labels are hand-corrected by the maintainer and definitive over any matcher output
- test with `pnpm test:scanner`; accuracy report with `pnpm scanner:report`; atlas regen commands and the assets-repo/CDN flow are in the README
- events, snap tables, and fixtures speak sendou ids (`ModeShort`/`StageId`/weapon ids/`Ability`) — never reintroduce English game-name literals outside the generated localized snap tables
