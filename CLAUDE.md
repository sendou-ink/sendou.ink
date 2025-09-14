## Development Commands

- `npm run dev:prod` - Start development server
- `npm run lint` - Run eslint
- `npm run format` - Format files with Prettier
- `npm run check` - Run Svelte checks including typechecks
- `npm run test:unit` - Run unit tests via Vitest
- `npm run checks` - Run all checks that would run in the CI pipeline. These should pass before any task is considered complete.

## Project Architecture

```
src/
├── lib/
│   ├── api/           # API routes organized by feature
│   ├── components/    # Reusable Svelte components
│   ├── constants/     # Constants organizer by feature
│   ├── paraglide/     # Generated i18n files
│   └── server/        # Server-side utilities
├── routes/            # SvelteKit file-based routing
├── scripts/           # Standalone scripts
└── app.html           # App shell template
```

Svelte components can also be colocated next to the route file as long as it is only used by that route.

## Svelte

- All Svelte code written should be Svelte 5 with runes
- Always include the `lang="ts"` attribute in the script tag
- Do not use index as a key in each block, key should come from the data
- Instead of using the `$derived` rune, prefer inlining the computation if it's a simple oneliner or just accessing a key of an object

## Styling

- Plain CSS via Svelte scoped style tags
- Use design system tokens (css custom properties/variables) as defined in the `src/styles/vars.css` file instead of hard coding colors and spacings

## Typescript

- TypeScript strict mode is enabled
- Infer as much as possible from other types using built-in generics like Omit and Pick
- Always define a type, do not bypass the TypeScript compiler with a comment or a loose type

## API Architecture

- **Feature-based organization**: Each feature (auth, tournament, team, etc.) has its own API folder
- **Remote functions**: Uses SvelteKit's experimental remote functions for type-safe client-server communication
- **Consistent patterns**:
  - `index.ts` - Exports functions and types
  - `schemas.ts` - Zod validation schemas
  - `queries.remote.ts` - Database queries
  - `actions.remote.ts` - Mutation actions

## Coding styles

- Prefer destructed object for function arguments if there are more than two parameters, especially if they are of the same type to avoid mixing them up

## Key Concepts

#### Database

- The database used is SQLite3
- Always use Kysely for type-safe queries
- Copy of production database is available at the following file path: `./db-prod.sqlite3`

#### Testing Strategy

- Unit tests for core logic (no Svelte/DB code) preferred (via Vitest)
- Integration tests using in-memory SQLite sparingly (via Vitest)
- E2E tests for critical user flows (via Playwright)
- Test files co-located with source code

#### Error handling

- Throwing for normal control flow should be avoided, instead use the `neverthrow` library

#### Importing

- Typescript files that start with a capital letter are modules and should be imported like so: `* as ExampleModule from "./ExampleModule.ts` instead of importing the functions directly
- Use SvelteKit's `$lib` short-hand import instead of relative imports
