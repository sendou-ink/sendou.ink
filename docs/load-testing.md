# Load Testing Guide

This guide explains how to profile and optimize slow routes in sendou.ink.

## Prerequisites

Install autocannon globally:

```bash
npm install -g autocannon
```

## Step 1: Identify Slow Routes

### Data URLs vs Full Routes

When benchmarking a route like `/leaderboards`, the response includes server-side rendering (HTML generation). To isolate just the data loader performance, use React Router 7's data URLs:

```bash
# Full route (includes SSR)
autocannon -c 10 -d 10 http://localhost:301/leaderboards

# Data only (loader function only)
autocannon -c 10 -d 10 "http://localhost:301/leaderboards.data?_routes=features%2Fleaderboards%2Froutes%2Fleaderboards"
```

The data URL format is: `{route}.data?_routes={encoded_route_path}`

To discover the exact data URL for a route, open Chrome DevTools Network tab, navigate to the page, then filter by "Fetch/XHR" - you'll see the `.data` requests made during client-side navigation.

### Running benchmarks

Use autocannon to benchmark endpoints:

```bash
# Basic benchmark (10 connections, 10 seconds)
autocannon -c 10 -d 10 http://localhost:301/leaderboards

# With more connections to simulate load
autocannon -c 50 -d 30 http://localhost:301/leaderboards

# Single request timing
curl -s -o /dev/null -w "Time: %{time_total}s\n" "http://localhost:301/leaderboards"
```

### Reading autocannon output

```
┌─────────┬────────┬─────────┬─────────┬─────────┬────────────┬────────────┬─────────┐
│ Stat    │ 2.5%   │ 50%     │ 97.5%   │ 99%     │ Avg        │ Stdev      │ Max     │
├─────────┼────────┼─────────┼─────────┼─────────┼────────────┼────────────┼─────────┤
│ Latency │ 826 ms │ 1478 ms │ 7674 ms │ 8985 ms │ 1989.09 ms │ 1770.75 ms │ 8985 ms │
└─────────┴────────┴─────────┴─────────┴─────────┴────────────┴────────────┴─────────┘
```

- **50%** (median): Half of requests are faster than this
- **97.5%/99%**: Tail latency - worst case for most users
- **Avg**: Average response time
- **Max**: Slowest single request

Target: median < 100ms, 99th percentile < 500ms

## Step 2: Profile SQL Queries

Create a profiling script to test queries directly against the prod database:

```typescript
// profile-query.ts
import Database from "better-sqlite3";

const db = new Database("db-prod.sqlite3");

function timeQuery(name: string, fn: () => unknown) {
  const runs: number[] = [];
  let result: unknown;

  // Run 5 times for consistent measurement
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    result = fn();
    runs.push(performance.now() - start);
  }

  const avg = runs.reduce((a, b) => a + b, 0) / runs.length;
  const rowCount = Array.isArray(result) ? result.length : "N/A";
  console.log(`${name}: avg ${avg.toFixed(2)}ms (${rowCount} rows)`);
  return { avg, result };
}

// Example: Test a query
const stm = db.prepare(`
  SELECT * FROM "User" WHERE "id" = @id
`);

timeQuery("User lookup", () => stm.all({ id: 1 }));

db.close();
```

Run with:

```bash
npx tsx profile-query.ts
```

## Step 3: Analyze Query Plans

Use `EXPLAIN QUERY PLAN` to understand how SQLite executes queries:

```typescript
const plan = db.prepare(`
  EXPLAIN QUERY PLAN
  SELECT * FROM "User"
  JOIN "Skill" ON "Skill"."userId" = "User"."id"
  WHERE "Skill"."season" = @season
`).all({ season: 10 });

console.log(JSON.stringify(plan, null, 2));
```

### Reading query plans

- **SCAN**: Full table scan (slow for large tables)
- **SEARCH USING INDEX**: Index lookup (fast)
- **USE TEMP B-TREE**: Temporary sorting/grouping needed

## Step 4: Check Indexes

```typescript
// List indexes on a table
const indexes = db.prepare(`PRAGMA index_list("Skill")`).all();
console.log("Indexes:", JSON.stringify(indexes, null, 2));

// Get columns in an index
for (const index of indexes) {
  const info = db.prepare(`PRAGMA index_info("${index.name}")`).all();
  console.log(`${index.name}:`, JSON.stringify(info, null, 2));
}

// Table row counts
const count = db.prepare(`SELECT COUNT(*) as count FROM "Skill"`).get();
console.log(`Skill rows: ${count.count}`);
```

## Common Optimizations

### 1. LEFT JOIN → INNER JOIN

If your `WHERE` clause filters on the joined table, `LEFT JOIN` is unnecessary and prevents index usage:

```sql
-- Slow: scans entire ReportedWeapon table
SELECT * FROM "ReportedWeapon"
LEFT JOIN "GroupMatch" ON ...
WHERE "GroupMatch"."createdAt" > @date

-- Fast: uses index on createdAt
SELECT * FROM "ReportedWeapon"
INNER JOIN "GroupMatch" ON ...
WHERE "GroupMatch"."createdAt" > @date
```

### 2. Add Missing Indexes

If query plan shows `SCAN` on a large table with a `WHERE` clause, add an index:

```sql
CREATE INDEX skill_season ON "Skill"("season");
```

### 3. Avoid ORDER BY in CTEs

```sql
-- Slow: sorts intermediate results
WITH q1 AS (
  SELECT ... ORDER BY count DESC
)
SELECT ... FROM q1

-- Fast: only sort final results
WITH q1 AS (
  SELECT ...
)
SELECT ... FROM q1 ORDER BY count DESC
```

### 4. Use HAVING Instead of Subquery Filter

```sql
-- Filter aggregates directly
SELECT "userId", count(*) as cnt
FROM "ReportedWeapon"
GROUP BY "userId"
HAVING count(*) >= 7
```

## Step 5: Verify Fix

Always verify optimizations produce identical results:

```typescript
const original = originalStm.all(params);
const optimized = optimizedStm.all(params);

console.log(`Original: ${original.length} rows`);
console.log(`Optimized: ${optimized.length} rows`);

// Compare results
const originalSet = new Set(original.map(r => JSON.stringify(r)));
const optimizedSet = new Set(optimized.map(r => JSON.stringify(r)));

const match = originalSet.size === optimizedSet.size &&
  [...originalSet].every(x => optimizedSet.has(x));

console.log(match ? "✓ Results match" : "✗ Results differ");
```

## Step 6: Re-benchmark

After applying fixes, restart the dev server and re-run autocannon:

```bash
# Restart server to pick up changes
# (Ctrl+C and npm run dev)

# Re-benchmark
autocannon -c 10 -d 10 http://localhost:301/leaderboards
```

## Example: Full Profiling Session

```bash
# 1. Benchmark the slow route
autocannon -c 10 -d 10 http://localhost:301/leaderboards

# 2. Create and run profiling script
cat > profile.ts << 'EOF'
import Database from "better-sqlite3";
const db = new Database("db-prod.sqlite3");

const start = performance.now();
const result = db.prepare(`YOUR_QUERY_HERE`).all({ /* params */ });
console.log(`Time: ${(performance.now() - start).toFixed(2)}ms`);
console.log(`Rows: ${result.length}`);

db.close();
EOF

npx tsx profile.ts

# 3. Clean up
rm profile.ts
```

## Route File Locations

| Route | Code Location |
|-------|---------------|
| `/leaderboards` | `app/features/leaderboards/` |
| `/q/*` | `app/features/sendouq/` |
| `/to/*` | `app/features/tournament/` |
| `/u/*` | `app/features/user-page/` |
| `/builds/*` | `app/features/builds/` |
