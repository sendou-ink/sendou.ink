---
name: e2e
description: Run, debug, and manage Playwright e2e tests. Use when running e2e tests, debugging test failures, writing new specs, or investigating test infrastructure issues.
---

# E2E Test Runner

## Architecture overview

- Tests live in `e2e/*.spec.ts`, config in `playwright.config.ts`
- Page objects live in `e2e/pages/<feature>/` — every spec uses them; conventions in `docs/dev/e2e-page-objects.md`, gotchas in `docs/dev/e2e-page-objects-migration.md`
- Global setup (`e2e/global-setup.ts`) builds the app (skipped when no build input changed since the last e2e build — tracked via `.e2e-build-marker`), creates per-worker databases, and starts one server per worker
- Port calculation: `E2E_BASE_PORT = PORT (from .env) + 500`. Default PORT is typically 4001, so base port = 4501. Worker N uses port base+N
- Worker count: `E2E_WORKERS` env, defaulting to `min(8, max(4, cores - 2))`
- Worker databases: `db-test-e2e-<N>.sqlite3` in the project root; every test starts from a wiped database holding only the admin (Sendou) and N-ZAP users, and builds its own data with the `factories` fixture
- MinIO (S3-compatible storage) is started via Docker Compose if not already running

## Pre-flight checks (run before every test execution)

Before running tests, check for these common issues:

1. **Stale worker databases** — Files matching `db-test-e2e-*.sqlite3` in the project root can cause "table already exists" migration errors if the schema has changed since they were created. Delete them (`rm -f db-test-e2e-*.sqlite3`); global setup recreates them.

2. **Port conflicts** — Check if anything is already listening on the e2e ports (base port + worker index):
   ```
   lsof -i :4501-4508 2>/dev/null
   ```
   If ports are occupied by leftover e2e servers, kill them. If occupied by something else, warn the user.

3. **Docker running** — MinIO requires Docker. Check with `docker info` if there are storage-related failures.

## Running tests

### Run all tests
```bash
pnpm run test:e2e
```

### Run a specific test file
```bash
pnpm exec playwright test e2e/<name>.spec.ts
```
Batch multiple files into one invocation — every invocation pays global setup.

### Flaky detection (repeats each test 10 times, stops on first failure)
```bash
pnpm run test:e2e:flaky-detect
```

### Force a rebuild of the app
```bash
E2E_FORCE_BUILD=true pnpm run test:e2e
```
Global setup reuses the previous build when nothing under `app/`, `public/`, the lockfile, or the vite/react-router configs changed. Use this override if you suspect a stale build (e.g. after changing env-dependent build behavior).

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
- **"Test ended with database writes the server never saw"** → A factory call was not followed by a helper that talks to the server; add a `navigate`/`impersonate` after the writes

### Step 3: Reduce to single debug worker
If the error is unclear, re-run with debug output and a single worker to see server logs:
```bash
E2E_DEBUG=true E2E_WORKERS=1 pnpm exec playwright test e2e/<failing-test>.spec.ts
```
This shows stdout/stderr from the test server, which is hidden by default.

### Step 4: Examine trace artifacts
Playwright is configured with `trace: "retain-on-failure"`. After a failure, check `test-results/<test-folder>/error-context.md` for the page's accessibility snapshot at failure time, or view the trace:
```bash
pnpm exec playwright show-trace test-results/<test-folder>/trace.zip
```

### Cross-worker flakiness
All workers' servers share one websocket (skalop) server, so another worker's actions can revalidate your page mid-interaction — a click on a React Aria button can register the press start but never complete it. The helpers (`waitForPOSTResponse`, `UserCard.open`) retry for this; a spec failing this way under full-suite load but passing alone usually needs its flow routed through such a retrying helper, not a sleep.

## Test pattern reference

Every test builds its own data with factories and drives the UI through page objects:

```typescript
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { expect, impersonate, test } from "./helpers/playwright";
import { BuildsPage } from "./pages/builds/builds-page";

test.describe("Feature", () => {
	test("does something", async ({ page, factories }) => {
		await factories.BuildFactory.create({ ownerId: NZAP_TEST_ID });

		await impersonate(page, NZAP_TEST_ID);
		const builds = new BuildsPage(page);
		await builds.goto();
		// ... interact via page object methods, assert in the spec ...
	});
});
```

Key rules:
- The database starts each test holding only the admin and N-ZAP; the `factories` worker fixture (see `e2e/helpers/factories.ts` for the registry) creates everything else
- Locators live in page objects under `e2e/pages/` — specs contain no raw `getByTestId`/`getByRole` calls; see `docs/dev/e2e-page-objects.md`
- Use `navigate()` instead of `page.goto()` — it waits for hydration (page objects' `goto()` methods wrap it)
- Use `submit()` instead of clicking submit buttons directly — it waits for the POST response
- Use `impersonate(page, userId?)` to authenticate. Default is admin (ADMIN_ID); prefer N-ZAP (`NZAP_TEST_ID`) when the flow doesn't need admin rights
- Avoid `page.waitForTimeout` — use assertions or `waitFor` patterns instead
- Import `test` from `./helpers/playwright` (not from `@playwright/test`) — it includes worker port fixtures and the database reset
- Factory writes must be followed by a helper that talks to the server (`navigate`, `impersonate`, `submit`) or the test fails with "writes the server never saw"

## Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `E2E_WORKERS` | Number of parallel workers | min(8, max(4, cores − 2)) |
| `E2E_DEBUG` | Show server stdout/stderr when "true" | unset |
| `E2E_FORCE_BUILD` | Rebuild the app even when inputs look unchanged | unset |
| `PORT` | Base port for dev server (e2e adds 500) | 5173 |
