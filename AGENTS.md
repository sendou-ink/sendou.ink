## General

- only rarely use comments, prefer descriptive variable and function names (leave existing comments as is)
- if you encounter an existing TODO comment assume it is there for a reason and do not remove it

## Commands

- `npm run typecheck` runs TypeScript type checking
- `npm run biome:fix` runs Biome code formatter and linter
- `npm run test:unit` runs all unit tests
- `npm run i18n:sync` syncs translation jsons with English and should always be run after adding new text to an English translation file 

## Typescript

- prefer early return over nesting if statements
- do not use `any` type
- for constants use ALL_CAPS
- always use named exports
- Remeda is the utility library of choice

## React

- prefer functional components over class components
- prefer using hooks over class lifecycle methods
- do not use `useMemo`, `useCallback` or `useReducer` at all
- state management is done via plain `useState` and React Context API
- avoid using `useEffect`
- split bigger components into smaller ones
- one file can have many components
- all texts should be provided translations via the i18next library's `useTranslations` hook's `t` function
- instead of `&&` operator for conditional rendering, use the ternary operator

## Styling

- use CSS modules
- one file containing React code should have a matching CSS module file e.g. `Component.tsx` should have a file with the same root name i.e. `Component.module.css`
- clsx library is used for conditional class names
- prefer using [CSS variables](../app/styles/vars.css) for theming

## SQL

- database is Sqlite3 used with the Kysely library
- database code should only be written in Repository files
- down migrations are not needed, only up migrations
- every database id is of type number

## E2E testing

- library used for E2E testing is Playwright
- `page.goto` is forbidden, use the `navigate` function to do a page navigation
- to submit a form you use the `submit` function

## Unit testing

- library used for unit testing is Vitest
