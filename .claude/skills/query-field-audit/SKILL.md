---
name: query-field-audit
description: Audit whether repository defineQuery base selects and vocabulary steps match what the code actually reads. Use after migrating a repository to defineQuery, before trimming or growing a base select, when adding or removing with* steps, or when asked whether a query fetches fields nobody uses.
---

# Query field audit

`pnpm run audit:query-fields` measures how the fields of every `defineQuery` chain (`docs/dev/repositories.md`, "Composable reads") are used. It removes one thing at a time, type-checks the project in memory (source files are never touched) and records where the build breaks:

- each element of a base `select` list
- each call of a vocabulary step that adds or maps fields (`.withLogo()`, `.withPermissions()`)
- each column of a `.withColumns([...])` call and each `.with(step)` one-off that adds fields

Pure filter, sort and lift steps aren't removed, because removing them changes the rows without a type error. Neither are steps that only rewrite a field the row already has (`sortAbilitiesIfPreferred` re-sorting `abilities`), since removing them breaks nothing either. The report lists those as not audited.

## Running

```bash
pnpm run audit:query-fields --query TeamRepository.teams   # one definition, a minute or two
pnpm run audit:query-fields --query ScrimPostRepository     # every definition of a repository
pnpm run audit:query-fields --list                          # what would be checked, no type-checking
pnpm run audit:query-fields --json /tmp/audit.json          # everything, ~10 minutes; JSON keeps every site
```

The report goes to stdout and progress to stderr. Redirect stdout to a file and read it there.

Each removal re-checks only the files that transitively import the changed file. Past 600 such files it type-checks the whole project, which is most removals in a repository file. `--workers <n>` sets how many tsgo processes run in parallel (4 by default), and `--full` always checks the whole project.

## Reading the report

Per definition you get its entry points (where its chains start, the repository's wrapper functions resolved to their callers), then:

- **Base select table**: per field, how many distinct files have each kind of breakage.
- **Steps table**: per field-adding step, its calls and how many of them nothing reads.
- **Details**: every removal with its verdict and the `file:line` sites, capped in the markdown (`--json` has them all).

Kinds of breakage:

| kind | meaning |
|---|---|
| reads | code reads the field (TS2339 naming it): a real use |
| type demands | a declared type requires it: a `Pick<…>`, a prop type, a type derived from a different chain, or a generic helper's parameter (`requirePermission(team, "EDIT")` demands `permissions`, a real use). Open the type and check whether anything reads the field through it before calling it used |
| chain | a later step's mapper needs the field (the chain collapsed to `never`) |
| other | anything else, listed with the message. Usually fallout from one of the above (implicit `any` after a field vanished) |

Verdicts: `UNUSED` (nothing broke), `TEST ONLY` (production code only test files read), `TYPE ONLY` (only type demands, see above), `used`.

## Deciding what to change

The audit gives evidence; the decision stays a judgment call.

- **Base field `UNUSED`**: drop it from the base select. If a call site turns out to need it later, it comes back with `.withColumns([...])` (plain column) or a vocabulary step (computed).
- **Base field read by few entry points**: weigh the count against the cost. A plain integer or short text column read by a minority can stay. A correlated subquery or JSON aggregate read by a minority belongs in a vocabulary step. Identity fields (`id`, the name or title) stay even when few sites read them.
- **Step call `UNUSED`**: remove the call, unless the step also changes the rows (filters, joins, sorts or lifts a guard, noted in the report). Then only its fields go unread and the call stays. When a filtering step's fields go unread at every call, consider whether the step should select them at all.
- **Step `NEVER CALLED` or `UNUSED EVERYWHERE`**: delete it from the vocabulary (knip can't catch unused vocabulary words, they are object properties).
- **`TEST ONLY`**: production doesn't need it. Move the test onto what production does, or have the test add the field itself.
- **`withColumns` entry `UNUSED`**: drop the column from the call.

After changing anything, run `pnpm run checks`; the e2e specs of the touched features catch reads the types can't see.

## Blind spots

Only reads that go through the types count, so these look `UNUSED` while they are not:

- a read behind `as`, `any` or a string key (`R.pick(row, ["x"])`)
- rows an API route returns as its response (`app/features/api-*/routes`, flagged in the report): the reader is outside this codebase
- a field consumed through an optional property of a shared type: the consumer handles it missing, so removing it is no type error but changes behavior. When the audit shows that, make the consumer's prop type require the field where it matters (`ArtGrid` takes `UserPageArt[]`, permissions included, whenever it gets a `pageUserId`)

Also outside the audit: the `scripts/` project (benchmark cases) isn't part of the checked program, so its chains don't count as entry points. Base selects that aren't a list, like `users()`'s `commonUserSelect(eb)`, are listed as not audited.
