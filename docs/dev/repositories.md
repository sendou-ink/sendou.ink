# Repositories

Repositories are the only place SQL is written. Loaders and actions compose the building blocks repositories export (see "Composable reads" below) but never write queries of their own. One per feature (`app/features/<feature>/FeatureRepository.server.ts`), imported as a module: `import * as VodRepository from "~/features/vods/VodRepository.server"`.

See [database-schemas.md](./database-schemas.md) for how columns are typed and [database-relations.md](./database-relations.md) for how the tables relate. Entities that can be acted on get their `permissions` object built in the Repository read function — see [permissions.md](./permissions.md).

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
- Return plain data or a chain from `defineQuery` (see "Composable reads"). Never return a raw Kysely query builder or `sql` fragment; shared SQL fragments live in `~/utils/kysely.server`.
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

## Composable reads

An entity's reads are defined once with `defineQuery` (`~/db/entity-query`): the **base shape** (what "a Build" means everywhere) plus a **vocabulary** of named steps. Loaders and actions compose a chain of those steps instead of calling a near-duplicate `find*` function per screen. `BuildRepository.builds` is the reference.

```ts
// BuildRepository.server.ts
export const builds = defineQuery({
	root: "Build",
	select: (qb) => qb.select((eb) => ["Build.id", "Build.title", /* … */]),
	// runs on every row, before the steps' mappers
	map: (row) => ({ weapons: row.weapons.map(/* … */) }),
	guards: { private: (qb) => qb.where("Build.isPrivate", "=", 0) },
	vocabulary: ({ lift }) => ({
		withAuthor: () => UserRepository.withUser("author", "Build.ownerId", ["plusTier"]),
		visibleToActor: () => lift("private", (qb) => qb.where(/* public or the actor's own */)),
		forWeapon: (weaponId: MainWeaponId) =>
			refine("Build", (qb) => qb.innerJoin("BuildWeapon", /* … */).where(/* … */))
				.sortedBy(["BuildWeapon.sortValue", "asc"]),
		newestFirst: () => sortedBy("Build", ["Build.updatedAt", "desc"]),
		withEditPermissions: () =>
			mapRows("Build", (row: { ownerId: number }) => ({ permissions: { EDIT: [row.ownerId] } })),
	}),
});

// loaders/u.$identifier.builds.server.ts, at the bottom of the file
function userBuilds(userId: number) {
	return BuildRepository.builds()
		.where({ ownerId: userId })
		.visibleToActor()
		.newestFirst()
		.withEditPermissions();
}
```

- **Steps are `refine` (plain Kysely, only the root table in scope), `sortedBy`, `mapRows` and `lift`.** A word whose filter is switched off (an empty list, a `null` value) returns `unchanged(root)` so callers can chain it unconditionally. They compose freely because the chain applies them in a fixed phase order when it compiles: guards and filters, selections, sort, `limit`, resolvers, then mappers. Only sort keys depend on call order; they stack like Kysely's `orderBy`, and `defaultSort` is used when no step sorts.
- **Sorting goes through `sortedBy`**, never `orderBy` inside `refine` (the chain throws when it compiles), so the sort keys stay known to the chain. A key is a column or an expression over the root's columns (`[(eb) => eb("LFGPost.authorId", "=", viewerId), "desc"]` puts the viewer's posts first); either must never be `null`.
- **Row types are inferred.** A mapper declares the fields it reads (`(row: { ownerId: number }) => …`); using it before they are on the row, or writing a key another step mapper already wrote, is a type error. What every read of the entity needs goes in the base `map`, not a step. `QueryRow<typeof chain>` names the resulting row type.
- **Secure by default.** `guards` apply unless a step lifts them (`visibleToActor`, `ownedByActor`, `includingPrivate`), so a forgotten step returns fewer rows, never someone else's private ones. Keep the guard viewer independent.
- **Related data comes in through correlated subqueries.** SQLite only has nested-loop joins, so a select-list subquery is the same index probe a join does, and it only runs for rows that make it past the sort and limit. A step may join privately to filter or sort by another table, as `forWeapon` does.
- **Cross-entity helpers are keyed by the foreign key column**: `UserRepository.withUser("author", "Build.ownerId", ["plusTier"])` infers the root from the string, only accepts columns with a foreign key to `User`, and gives `CommonUser` (or `CommonUser | null` for a nullable column) plus the named extras.
- **Values the database can't produce come from resolvers.** `defineResolver(name, load)` gives an expression selected like any other, also inside nested JSON: `UserCardRepository.cardOf(eb.ref("User.id")).as("card")`, or the `card` extra of `withUser`. After the query ran the chain collects every key of the rows, calls `load` once per resolver and puts the values in place (`null` for a missing one) before the mappers run. The user card is one: it merges in-memory season data and the viewer's private note into a cached query, so render it with `<UserCard data={user.card}>` instead of collecting ids in the loader.
- **The actor is read, never passed.** Steps call `actorIdOrNull()`/`actorId()`/`getUser()` themselves, so they only work inside a request. Plain equality filters use the generic `.where({ ownerId })` rather than a vocabulary step.
- **Compositions live at the bottom of the loader or action file.** One needed by a second route moves into the repository as a named export. A one-off step is `.with(refine("Build", (qb) => …))`; the second time it's needed, it moves into the vocabulary.

### Pagination

Paging is a chain call, not something each repository writes. `LFGRepository.posts()` and the LFG board loader are the reference.

```ts
// numbered pages with a count; `containing` serves the page a linked row is on
const { items, currentPage, pagesCount, totalCount } = await chain.paginate({ page, size, containing: postId });

// cursor pages; `after` is the previous page's `nextCursor`, straight from a search param
const { items, nextCursor } = await chain.paginate({ after: cursor, size });
```

- **Filters must be SQL steps.** Filtering fetched rows in JS gives short pages and fetches everything; turn each filter into a step that is a no-op for an unset value, so the loader can pass the search params straight through.
- **The order is total.** The root's `id` is appended as the last sort key, so equal keys never swap between pages. Paginating needs a table with a single `id` primary key.
- **Key-first.** Phase 1 runs the guards, filters, sort and seek, selecting only ids (and the total, as a window count). Phase 2 fetches those ids' rows, keeping only the steps that select something, so a filter or a sort join never runs twice.
- **Cursors are opaque and forgiving.** A tampered or stale cursor serves the first page instead of throwing, so the search param can be a plain nullable string.

## Generic CRUD

`crud(table)` (`~/db/crud`) gives the single-table operations typed from `tables.ts` and the generated key metadata in `schema.gen.ts`, so trivial `findById`/`deleteById` style functions aren't written by hand. Repositories re-export the ops they want to expose, which keeps call sites as `BuildRepository.deleteById(id)` and lets knip catch unused ones:

```ts
export const { deleteById } = crud("Build");

// a secondary table: keep it private or rename the binding
const notes = crud("PrivateUserNote");
export const { deleteById: deleteDateById } = crud("CalendarEventDate");
```

- The ops follow the table's keys: `findById`/`updateById`/`deleteById` need a single `id` primary key, `findOneBy` takes a complete unique key and `upsert`'s `conflict` must be one, views get no writes. `findManyBy` requires a `limit`, `update`/`delete` reject an empty filter, `trx` is the last parameter.
- Updates and upserts stamp `updatedAt` on tables that have one, and the ops don't accept it as a value. An update with no values only stamps it: `LFGRepository.bumpById` is `updateById(id, {})`.
- `crud` reads are raw table access and don't see chain guards. An entity with guards doesn't re-export them for public reads; internal lookups like an ownership check are fine.
- A table whose derived rows are kept in sync by app code keeps its hand-written writes (`BuildRepository.insert`/`update` maintain `BuildWeapon.sortValue` and the ability sums).
- Still hand-written: transactions over several tables, `*Own*` actor scoping, domain errors, aggregate/stats queries and perf-tuned reads.

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

e2e catches loud failures (an SQL error, a broken page). Repository tests exist for bugs that would ship quietly: a wrong row set, a leaked private row, a wrong number. Write one for:

- Guards and their lifts, one test each (another user's private build never appears)
- Vocabulary steps with real semantics: filters with edge cases, mappers with a formula, aggregate/stats queries
- Transactions touching several tables and writes maintaining derived rows

Not tested per repository: `crud` re-exports and the chain infra (tested once in `app/db`), route-side compositions, trivial finds and deletes. Tests run against `db-test.sqlite3`.

A test's setup goes through the factories in `app/db/seed/factories`, never a raw `db.insertInto` / `db.updateTable` — a lint rule enforces this, and [seeds.md](./seeds.md) covers the factories and the rare exceptions. Only the write a test is actually asserting about is called through its repository directly. There is no cleanup to write: the database is wiped after every test that wrote to it.
