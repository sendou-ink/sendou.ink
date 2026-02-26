---
name: e2e
description: Run, debug, and manage Playwright e2e tests. Use when running e2e tests, debugging test failures, regenerating seed databases, or investigating test infrastructure issues.
---

# E2E Test Runner

## Architecture overview

- Tests live in `e2e/*.spec.ts`, config in `playwright.config.ts`
- Global setup (`e2e/global-setup.ts`) builds the app, creates per-worker databases, and starts one server per worker
- Port calculation: `E2E_BASE_PORT = PORT (from .env) + 500`. Default PORT is typically 4001, so base port = 4501. Workers use ports base+0 through base+3
- Worker databases: `db-test-e2e-0.sqlite3` through `db-test-e2e-3.sqlite3` in the project root
- Seed databases (pre-seeded snapshots): `e2e/seeds/db-seed-*.sqlite3`
- MinIO (S3-compatible storage) is started via Docker Compose if not already running

## Pre-flight checks (run before every test execution)

Before running tests, check for these common issues:

1. **Stale worker databases** — Files matching `db-test-e2e-*.sqlite3` in the project root can cause "table already exists" migration errors if the schema has changed since they were created. Run `npm run test:e2e:generate-seeds` to regenerate these from the seed databases.

2. **Port conflicts** — Check if anything is already listening on the e2e ports (base port through base+3):
   ```
   lsof -i :4501-4504 2>/dev/null
   ```
   If ports are occupied by leftover e2e servers, kill them. If occupied by something else, warn the user.

3. **Seed databases exist** — Verify `e2e/seeds/` contains the expected seed files. If missing, run `npm run test:e2e:generate-seeds`.

4. **Docker running** — MinIO requires Docker. Check with `docker info` if there are storage-related failures.

## Running tests

### Run all tests
```bash
npm run test:e2e
```

### Run a specific test file
```bash
npx playwright test e2e/<name>.spec.ts
```

### Flaky detection (repeats each test 10 times, stops on first failure)
```bash
npm run test:e2e:flaky-detect
```

### Regenerate seed databases (after schema/migration changes)
```bash
npm run test:e2e:generate-seeds
```

## Debugging failures

Follow this funnel when tests fail:

### Step 1: Read the error output
- Look for the actual assertion or timeout that failed
- Check if it's an infrastructure error (server didn't start, migration failed) vs. a test logic error

### Step 2: Check infrastructure issues
Common infrastructure errors and fixes:
- **"table already exists"** → Stale worker DBs. Run `rm -f db-test-e2e-*.sqlite3`
- **"Server on port X did not start within timeout"** → Port conflict or app build error. Check ports with `lsof -i :<port>` and check for build errors
- **"MinIO failed to start"** → Docker not running or compose issue. Check `docker info`
- **Seed-related errors** → Run `npm run test:e2e:generate-seeds`

### Step 3: Reduce to single debug worker
If the error is unclear, re-run with debug output and a single worker to see server logs:
```bash
E2E_DEBUG=true E2E_WORKERS=1 npx playwright test e2e/<failing-test>.spec.ts
```
This shows stdout/stderr from the test server, which is hidden by default.

### Step 4: Examine trace artifacts
Playwright is configured with `trace: "retain-on-failure"`. After a failure, view the trace:
```bash
npx playwright show-trace test-results/<test-folder>/trace.zip
```

## Test pattern reference

Every test follows this pattern — use these imports from `~/utils/playwright`, NOT raw Playwright APIs:

```typescript
import { expect, impersonate, navigate, seed, test } from "~/utils/playwright";

test.describe("Feature", () => {
  test("does something", async ({ page }) => {
    await seed(page);                    // Reset DB to a known seed state
    await impersonate(page, USER_ID);    // Log in as a specific user (default: admin)
    await navigate({ page, url: "..." });// Navigate (waits for hydration)
    // ... interact with the page ...
    await submit(page);                  // Submit a form (waits for POST response)
  });
});
```

Key rules:
- Use `navigate()` instead of `page.goto()` — it waits for hydration
- Use `submit()` instead of clicking submit buttons directly — it waits for the POST response
- Use `seed(page, variation?)` to reset the database. Available variations: DEFAULT, NO_TOURNAMENT_TEAMS, REG_OPEN, SMALL_SOS, NZAP_IN_TEAM, NO_SCRIMS, NO_SQ_GROUPS
- Use `impersonate(page, userId?)` to authenticate. Default is admin (ADMIN_ID)
- Avoid `page.waitForTimeout` — use assertions or `waitFor` patterns instead
- Import `test` from `~/utils/playwright` (not from `@playwright/test`) — it includes worker port fixtures

## Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `E2E_WORKERS` | Number of parallel workers | 4 |
| `E2E_DEBUG` | Show server stdout/stderr when "true" | unset |
| `PORT` | Base port for dev server (e2e adds 500) | 5173 |
