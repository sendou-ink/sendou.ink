# Repositories

Repositories are the only place database queries are written. One per feature (`app/features/<feature>/FeatureRepository.server.ts`), imported as a module: `import * as VodRepository from "~/features/vods/VodRepository.server"`.

See [database-schemas.md](./database-schemas.md) for how columns are typed and [database-relations.md](./database-relations.md) for how the tables relate.

Note: plenty of older repositories don't follow this yet. Fix them as you touch them rather than leaving a new style behind.

## Files

- One repository per feature. Split into several when a feature owns clearly separate table clusters (`TournamentRepository`, `TournamentTeamRepository`, `TournamentAuditLogRepository`), not merely because a file got long.
- **Module names are unique across the whole app.** Two `SkillRepository` files can't both be imported as `SkillRepository` in the same file.
- Order inside a file: types & constants → read functions → write functions → private helpers at the bottom.

## Naming

Reads:

| Returns | Name |
| --- | --- |
| One row or nothing | `findById`, `findByUserId`, `findLookingTeamsByTournamentId` |
| An array | `findAllByTournamentId`, `findAllVods` |
| A number | `countVods` |
| A boolean | `existsByCustomUrl`, `hasUnvalidatedImages` |

Writes are named after the SQL verb: `insert`, `update`, `upsert`, `deleteById`. Not `create`, `del`, `remove`, `add`.

Rules:

- **Name the lookup key**: `findById` when it's the table's own id, otherwise `ByUserId`, `ByTournamentId`, `ByInviteCode`. Bare nouns (`userCards`, `widgetsByUserId`) don't say what they do.
- **`Own` means the logged in user's own rows**: `updateOwnProfile`, `upsertOwnNote`. See "The acting user" below.
- Domain operations that aren't a plain write keep a domain verb (`mergeTeams`, `leaveLfg`, `finalize`). Don't force those into CRUD names.

## Arguments

- One value → positional. If it's an id, the name says which: `findById(id)`, `findAllByUserId(userId)`.
- Two or more → a single object literal. Name the type `<FunctionName>Args` when it's worth extracting.
- `trx` is always the last positional parameter, never a property of the args object.

```ts
export function updateTeamNote({ teamId, value }: { teamId: number; value: string | null }) { … }
export async function addInitialSkill(args: AddInitialSkillArgs, trx?: Transaction<DB>) { … }
```

## Transactions

The repository owns the transaction — actions never open one (if it can be avoided).

- A function that writes to more than one table wraps itself in `db.transaction().execute(...)`.
- A function callers may need to compose into a bigger transaction takes an optional `trx`:

```ts
export async function addInitialSkill(args: AddInitialSkillArgs, trx?: Transaction<DB>) {
	const executor = trx ?? db;
	await executor.insertInto("Skill").values(…).execute();
}
```

- Private helpers that only ever run inside a transaction take a required `trx: Transaction<DB>`.

## Return values

- A missing row is `undefined` — what Kysely already gives us. Don't map it to `null`.
- Return plain data. Never return a Kysely query builder or a raw `sql` fragment from a repository; shared SQL fragments live in `~/utils/kysely.server`.
- Convert at the boundary so callers deal in domain values: take a `boolean` and write it with `toDBBoolean`, take a `Date` and write it with `dateToDatabaseTimestamp`.
- **A write returns the inserted row's id when the row has an id** — that is, when other rows can reference it. `insert`, `upsert`, `addInitialSkill`, `insertFriendship` and friends all `.returning("id")` (or `.returningAll()` where the caller wants the row), and a bulk insert returns an array in insertion order. Writes to join and detail tables, keyed by their foreign keys rather than an id of their own (`GroupMember`, `MapPoolMap`, `PlusVote`, `AllTeamMember`), return nothing — there is no value a caller could use.

## Types

Infer as much as possible. A repository's types should follow from the query and the schema, so that changing a column breaks the code that depends on it.

- **Never `as`.** No `as any`, no `as unknown as`, no asserting a row into the shape you wanted. A cast that seems necessary means the query or the `tables.ts` typing is wrong — fix that instead.
- `$castTo<T>()` is the sanctioned exception, and only where Kysely genuinely can't infer: raw `sql` fragments and `json_group_array` aggregates. `$narrowType<{ x: NotNull }>()` for narrowing Kysely knows it can't prove.
- **Return types are derived, never written by hand**: `type Vod = Unwrapped<typeof findAllVods>`.
- **Insert arguments come from `TablesInsertable`** rather than restating column types:

```ts
export function insertFriendCode(args: TablesInsertable["UserFriendCode"]) { … }

// Omit what the repository fills in itself
export function addModNote(args: Omit<TablesInsertable["ModNote"], "authorId">) { … }

// or pick single columns when the args are a mix
type InsertArgs = {
	ownerId: TablesInsertable["Build"]["ownerId"];
	weapons: Array<BuildWeapon>;
};
```

- Use `Tables["Table"]["column"]` the same way for read arguments and hand-built row types.

## The acting user

`actorId()` reads the logged in user from request context. Use it when the acting user isn't something the caller gets to choose. There are three such cases:

- **The actor's own rows.** The operation is by definition about the logged in user. Name it `*Own*`: `updateOwnProfile`, `deleteOwnNoteById`, `upsertOwn`.
- **Attribution.** The write records who performed it — `authorId`, `actorUserId`, `reportedByUserId`, `canceledByUserId`. The function isn't otherwise about the actor, so it keeps its normal name (`insert`, `cancelScrim`, `addModNote`); the JSDoc mentions the column it fills.
- **Viewer scoping.** A read whose visible rows depend on who's asking uses `actorIdOrNull()`, since these routes also serve anonymous visitors. The JSDoc says what the actor scopes.

Any user id the caller picks is an explicit parameter — `findAllByUserId(userId)` must never quietly mean the actor. Code that has to run outside a request (routines, scripts, seeds) can't use `actorId()` at all, so functions they call take ids explicitly.

## What belongs in a repository

- Queries, row mapping, and DB-shape conversion. Nothing else.
- Throw domain errors (`LimitReachedError`, `DuplicateEntryError`, `ConcurrentModificationError` from `~/utils/errors`), never an HTTP `Response`. Mapping to a status code is the action's job.
- Importing core logic is fine when the transformation must be identical everywhere the data is read (e.g. `sortBadgesByFavorites`, `Progression`). Decisions that vary per caller belong in the loader/action.
- Repositories may import other repositories, but no cycles.

## Query style

- Qualify every column: `"Video.id"`, not `"id"`.
- Reuse the shared selects in `~/utils/kysely.server` (`commonUserSelect`, `commonUserJsonObject`, `commonUserObjectFields`) instead of re-listing user fields.
- Prefer `jsonArrayFrom` / `jsonBuildObject` from `kysely/helpers/sqlite` over raw `json_group_array`. When raw `sql` is needed, a comment says why.
- Never insert row-by-row in a loop — one `values([...])` call.
- Optional filters are applied by reassigning the query:

```ts
let query = db.selectFrom("Video").selectAll("Video");
if (mode) {
	query = query.where("VideoMatch.mode", "=", mode);
}
```

## Performance

Writes block the whole server (see [architecture.md](./architecture.md)), and one slow read hurts every route.

- Every list read is bounded — a `limit` parameter or a key that limits the result set.
- Check `EXPLAIN QUERY PLAN` for new queries: no unexpected full table scans, indexes actually used.
- Read functions on hot paths get a case in `scripts/benchmark-db.ts`.

## Documentation

Repositories are modules, so exported functions get a JSDoc one-liner saying what they return, plus any scoping that isn't visible from the name ("excludes private builds", "latest row per season"). Non-obvious SQL gets a comment explaining *why* it's written that way — especially when the obvious form was rejected for performance reasons.

Private helpers can skip the JSDoc or keep it to a line.

## Testing

Not every function needs a test. Write one for:

- Transactions touching several tables
- Non-trivial mapping of the returned rows
- Permission, visibility or ownership scoping

Plain `findById`-style queries don't need one. Tests run against `db-test.sqlite3`.

A test's setup goes through the factories in `app/db/seed/factories`, never a raw `db.insertInto` / `db.updateTable` — a lint rule enforces this, and [seeds.md](./seeds.md) covers the factories and the rare exceptions. Only the write a test is actually asserting about is called through its repository directly. There is no cleanup to write: the database is wiped after every test that wrote to it.
