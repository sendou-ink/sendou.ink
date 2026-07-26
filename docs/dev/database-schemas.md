# Database schemas

How columns should be typed in `app/db/tables.ts`. See [database-relations.md](./database-relations.md) for how the tables relate to each other and [how-to.md](./how-to.md) for the migration workflow.

Note: some older columns don't follow this yet. Fix them as you touch them rather than leaving a new style behind.

## Booleans

SQLite has no boolean type, so booleans are `0`/`1` integers typed as `DBBoolean` (`0 | 1`).

- **Always `DBBoolean`**, never a raw `number`. The union is what stops `Number(x)` and other arbitrary integers from being inserted.
- **Always non-null.** Give the column `integer not null default 0` and type it `Generated<DBBoolean>`. A three-state boolean is almost never wanted — `null` just becomes a second way to say false that every reader has to remember to coalesce.
- **`DBBoolean | null` only for a genuine tri-state**, and then document what `null` means. Example: `TournamentMatchGameResult.ko` is `null` when KOs aren't collected for that bracket at all, which is different from "no KO happened".
- **Name flags `is*`/`has*`** (`isPrivate`, `isFinalized`, `isMainTeam`), not bare adjectives.

Converting to one:

- `toDBBoolean(someBoolean)` from `~/utils/sql` — use this instead of `Number(x)` or `x ? 1 : 0` when writing to the DB.
- `dbBoolean` / `checkboxValueToDbBoolean` from `~/utils/zod` for form and payload schemas.

Reading is just truthiness (`if (build.isPrivate)`); convert to a real boolean with `Boolean()` when the value crosses into a domain type.

Counter-examples that look like booleans but aren't: `User.banned` (`1` = permaban, otherwise a timestamp), `TournamentSub.canVc` (0/1/2), `TournamentTeam.abDivision` (0 = A, 1 = B).

## Generated vs. GeneratedAlways

- `Generated<T>` — column has a DB default, so it's optional on insert but you may still pass a value (`createdAt`, every boolean flag).
- `GeneratedAlways<T>` — never insertable or updatable: primary keys, computed columns, `createdAt` columns whose value should never be supplied by app code.
- Plain `T` — required on every insert.

## Timestamps

Unix seconds as `number`, named `*At`. Never ISO strings, never milliseconds.

Columns with `default (strftime('%s', 'now'))` are `Generated<number>`; use `GeneratedAlways<number>` when app code should never set them. Nullable `*At` columns double as markers (`deletedAt`, `validatedAt`, `leftAt`) — document that meaning in JSDoc.

Convert with `~/utils/dates`: `dateToDatabaseTimestamp`, `databaseTimestampToDate`, `databaseTimestampNow`.

## IDs

Every id is a `number`. Primary keys are `GeneratedAlways<number>`, foreign keys are plain `number` (or `number | null` when optional) and named `*Id`.

## JSON columns

Stored as text, typed with `JSONColumnType<T>` (not null) or `JSONColumnTypeNullable<T>` (nullable) from `~/utils/kysely.server`. Both serialize to `string` on insert, so pass `JSON.stringify(...)`.

The payload type lives with its feature and is imported by `tables.ts`. Only payloads with no natural feature home go in `app/db/tables-json.ts`.

## Enums

Type the column as the union of allowed values, either inline (`"PREPARING" | "ACTIVE" | "INACTIVE"`) or as a type imported from the feature's constants file (`TournamentStaffRole`, `LFGType`). Never `string`. Prefer a union over a lookup table when the values are code-level concepts that ship with a release.

## Views

Two naming conventions pair a base table with a filtered view: the `All` prefix (`AllTeam` table / `Team` view) and the `Unvalidated` prefix (`UnvalidatedVideo` / `Video`). Write to the prefixed table, read from the view. Both share one interface, so document per-column which fields are meaningless when read through the view. Mark view entries in the `DB` interface as read-only.

## JSDoc

Non-obvious columns get a JSDoc comment: what `null` means, what a magic number encodes, why a column is denormalized, which column it mirrors. Self-evident columns (`name`, `userId`) don't.

## SQLite migration quirks

- SQLite can't add `not null` to an existing column. To tighten one: add `"<col>_new" integer not null default 0`, `update ... set "<col>_new" = coalesce("<col>", 0)`, drop the old column, rename the new one. See `migrations/162-boolean-columns-not-null.js`.
- `drop column` fails if the column is indexed, part of a constraint, or referenced by a trigger, view, generated column or partial index. Check `sqlite_master` first.
- Only when that isn't enough, rebuild the table: `pragma foreign_keys = OFF`, create `X_new`, copy, drop, rename, recreate every index, then `pragma foreign_key_check` inside the transaction. See `migrations/161-tournament-match-nullable-opponents.js`.
- New columns can't be added with a non-constant default, so `createdAt` added later ends up nullable (see `TournamentStage.createdAt`).

## After changing the schema

1. Run the migration against `db.sqlite3` and `db-test.sqlite3` (`DB_PATH=db-test.sqlite3 pnpm run migrate up`).
2. Regenerate the e2e seeds with `pnpm run test:e2e:generate-seeds` — `pnpm run checks` fails otherwise.
