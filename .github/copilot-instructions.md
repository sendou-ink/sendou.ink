## General

- for new code only rarely use comments, prefer descriptive variable and function names

## Commands

- `npm run typecheck` runs TypeScript type checking
- `npm run biome:fix` runs Biome code formatter and linter

## Typescript

- prefer early return over nesting if statements
- prefer using `const` over `let` when the variable is not reassigned
- never use `var`
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

## Styling

- use CSS modules
- one file containing React code should have a matching CSS module file e.g. `Component.tsx` should have a file with the same root name i.e. `Component.module.css`
- clsx library is used for conditional class names
- prefer using [CSS variables](../app/styles/vars.css) for theming

## SQL

- database is Sqlite3 used with the Kysely library
- database code should only be written in Repository files
