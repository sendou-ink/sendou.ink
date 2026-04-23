## General

- only rarely use comments, prefer descriptive variable and function names (leave existing comments as is).
- if you encounter an existing TODO comment assume it is there for a reason and do not remove it
- task is not considered completely until `pnpm run checks` passes
- normal file structure has constants at the top immediately followed by the main function body of the file. Helpers are used to structure the code and they are at the bottom of the file (main implementation first, at the top of the file)
- note: any formatting issue (such as tabs vs. spaces) can be resolved by running the `pnpm run biome:fix` command
- typical way to structure pure logic is into Modules divided by logical domains which are imported with the "* as Module" import and then used like so "Module.foo()". These functions always need JSDoc.

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

## Remix/React Router

- new routes need to be added to `routes.ts`

## Styling

- use CSS modules
- one file containing React code should have a matching CSS module file e.g. `Component.tsx` should have a file with the same root name i.e. `Component.module.css`
- clsx library is used for conditional class names
- prefer using [CSS variables](./app/styles/vars.css) for theming
- for simple styling, prefer [utility classes](./app/styles/utils.css) over creating a new class
- use CSS nesting with the `&` selector to group related selectors (pseudo-classes, pseudo-elements, child selectors, attribute selectors) under their parent instead of repeating the parent selector

## SQL

- database is Sqlite3 used with the Kysely library
- database code should only be written in Repository files
- down migrations are not needed, only up migrations
- every database id is of type number
- if we are working on a branch by default we should add to the migration this branch added instead of creating a brand new one
- `/app/db/tables.ts` contains all tables and columns available
- `db.sqlite3` is development database
- `db-test.sqlite3` is the unit test database (should be blank sans migrations ran)
- `db-prod.sqlite3` is a copy of the production environment db which can be freely experimented with

## Unit testing

- library used for unit testing is Vitest
- Vitest browser mode can be used to write tests for components

## i18n

- by default everything should be translated via i18next
- some a11y labels or text that should not normally be encountered by user (example given, error message by server) can be english
- before adding a new translation, check that one doesn't already exist you can reuse (particularly in the common.json)
- add only English translation and use `pnpm run i18n:sync` to initialize other jsons with empty string ready for translators

## Commit messages

- do not mention claude or claude code

## Pull request

- use the template `/github/pull_request_template.md`
- do not mention claude or claude code in the description
