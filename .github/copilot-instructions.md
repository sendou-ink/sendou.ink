## General

- only rarely use comments, prefer descriptive variable and function names (leave existing comments as is)
- if you encounter an existing TODO comment assume it is there for a reason and do not remove it
- for running scripts `npm` is used
- all the imports should be at the top of the file

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
- instead of `&&` operator for conditional rendering, use the ternary operator

## Styling

- use CSS modules
- one file containing React code should have a matching CSS module file e.g. `Component.tsx` should have a matching `Component.module.css`
- clsx library is used for conditional class names
- prefer using [CSS variables](../app/styles/vars.css) for theming

## SQL

- database is Sqlite3 used with the Kysely library
- database code should only be written in Repository files
- refer to the [database schema](../app/db/tables.ts) when writing queries
- down migrations are not needed, only up migrations
- every database id is of type number

## Actions

actions in Remix handle POST requests and mutate data

- use the [template](../docs/dev/templates/action.md) as a reference
- action file always contains one named export: `action`
- action file is always located in the `actions/` folder of the feature
- action file is named corresponding to its route for example `/routes/route.tsx` has an action file `actions/route.server.ts`
- route file needs to import and re-export the `action` function from the action file
- `requireUserId` can be used to ensure the user is logged in and retrieve user id
- `requireUser` can be used to ensure the user is logged in and retrieve the full user object
- `getUserId` can be used to retrieve the user id if it exists (returns `undefined` if not logged in)
- `getUser` can be used to retrieve the user object if it exists (returns `undefined` if not logged in)
- `parseParams` function is to be used to parse the route params with a zod schema
- `parseRequestPayload` function is to be used to parse the request body with a zod schema
- `action` should return always something either a `redirect` function call or `null`
