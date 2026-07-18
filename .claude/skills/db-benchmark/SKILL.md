---
name: db-benchmark
description: Add or update repository READ function benchmark cases in the DB benchmark script. Use when a new repository read function is added, when benchmark cases are missing or outdated, or when working on scripts/benchmark-db.
---

# DB Benchmark Cases

The DB benchmark (`pnpm bench:db`) times repository READ functions against `db-prod.sqlite3` to find the slowest queries. Every exported READ function in a `*Repository.server.ts` file should have a case registered — when adding a new read function to a repository, add a matching benchmark case.

## Files

| File | Purpose |
|------|---------|
| `scripts/benchmark-db.ts` | Harness: CLI, timing loop, stats, output. Rarely needs changes. |
| `scripts/benchmark-db/cases.ts` | Case registry, grouped by repository file. **New cases go here.** |
| `scripts/benchmark-db/fixtures.ts` | Resolves worst-case arguments (heavy rows) from the DB. New argument kinds go here. |

## Adding a case

Cases live in `buildCases()` in `scripts/benchmark-db/cases.ts`, grouped under a `// <RepositoryName>` comment in file order. Three registration helpers:

```ts
// Function needs a fixture (skipped automatically if the fixture is null)
add("UserRepository.findLeanById", fx.heavyUser, (user) =>
	UserRepository.findLeanById(user.id),
);

// Function takes no arguments
addStatic("BadgeRepository.all", () => BadgeRepository.all());

// Function needs two fixtures
add(
	"SavedCalendarEventRepository.isSaved",
	both(fx.heavyUser, fx.heavyTournamentId),
	([user, tournamentId]) =>
		SavedCalendarEventRepository.isSaved({ userId: user.id, tournamentId }),
);
```

Rules:

- **READ functions only.** Never register inserts, updates, deletes, upserts or transactional helpers — the benchmark runs against real data in `db-prod.sqlite3`.
- **Case name** is `FileBasename.functionName`. For multiple variants of one function, suffix with a label: `BuildRepository.abilityPointAverages.all` / `.byWeapon`. The two `SkillRepository` files are disambiguated as `MmrSkillRepository` (mmr) — sendouq-match's has no reads.
- **Arguments should be worst-case**, not minimal: heaviest user, largest tournament, `showPrivate`/`withMembers`/`include*` options enabled, short search query (`SEARCH_QUERY`). The point is surfacing slow queries.
- Functions calling `actorId()`/`actorIdOrNull()` work: the harness runs all cases inside `userAsyncLocalStorage` with the heavy user as actor.

## Adding a fixture

If no existing fixture fits the new function's arguments, add one to `scripts/benchmark-db/fixtures.ts`:

1. Add a field to the `Fixtures` interface. Every field is `T | null` — null means "table empty, skip dependent cases". Bundle related values into one object (e.g. `heavyOrg`) so a case depends on a single field.
2. Add a `resolve<Name>()` helper at the bottom of the file and call it from `resolveFixtures()`.
3. Pick the **heaviest** row, not any row — the standard pattern is a `groupBy` + `count` + `orderBy count desc` + `limit 1` query:

```ts
async function resolveHeavyBuildUserId() {
	const row = await db
		.selectFrom("Build")
		.select(({ fn }) => ["ownerId", fn.countAll<number>().as("count")])
		.groupBy("ownerId")
		.orderBy("count", "desc")
		.limit(1)
		.executeTakeFirst();

	return row?.ownerId ?? null;
}
```

4. Never throw on empty tables — always resolve to `null` (`executeTakeFirst()` + `?? null`).
5. Verify table/column names against `app/db/tables.ts`.

## Verifying

```bash
pnpm run typecheck:scripts
pnpm exec biome check --error-on-warnings --write scripts/benchmark-db.ts scripts/benchmark-db
DB_PATH=db-prod.sqlite3 pnpm exec vite-node scripts/benchmark-db.ts -- --filter <caseName> --iterations 3
```

The filtered run must show the new case with plausible timings — not in the "Skipped" list (fixture resolved null: check the fixture query against real data) and not in the "errored" list (the case threw: check argument shapes). Note `pnpm bench:db --filter x` also works but runs the full fixture resolution either way.
