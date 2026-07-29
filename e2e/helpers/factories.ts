import type { Page } from "@playwright/test";
import {
	NZAP_TEST_DISCORD_ID,
	STAFF_TEST_DISCORD_ID,
} from "~/db/seed/constants";
import { ADMIN_DISCORD_ID } from "~/features/admin/admin-constants";

export type Factories = Awaited<ReturnType<typeof loadFactories>>;

let boundDbPath: string | null = null;

/**
 * Binds this worker's database file and hands back the factories. The only module
 * allowed to import seed code into the e2e process: the app db connection opens at
 * import time from `DB_PATH`, so everything reaching `~/db/sql` has to be imported
 * dynamically, after the env is set.
 */
export async function loadFactories(parallelIndex: number) {
	if (process.env.NODE_ENV === "test") {
		throw new Error(
			"NODE_ENV=test makes the app db an in-memory copy — factory writes would be discarded",
		);
	}

	// a `.env` value is fine to override, an earlier bind to another worker's file is not
	const dbPath = `db-test-e2e-${parallelIndex}.sqlite3`;
	if (boundDbPath && boundDbPath !== dbPath) {
		throw new Error(
			`The db connection is already bound to ${boundDbPath}, refusing to rebind to ${dbPath}`,
		);
	}
	process.env.DB_PATH = dbPath;
	boundDbPath = dbPath;

	return {
		backdate: (await import("~/db/seed/core/backdate")).backdate,
		BuildFactory: await import("~/db/seed/factories/BuildFactory"),
		UserFactory: await import("~/db/seed/factories/UserFactory"),
	};
}

/**
 * Brings the worker's database to the state every test starts from: empty except
 * for the anchor users whose ids production permission logic keys off, with the
 * server's caches flushed. Runs as an auto-use fixture, tests do not call it.
 */
export async function resetForTest(page: Page, factories: Factories) {
	const { dbReset } = await import("~/db/reset");
	await dbReset();

	await factories.UserFactory.createAdmin({
		discordId: ADMIN_DISCORD_ID,
		discordName: "Sendou",
	});
	await factories.UserFactory.createRegular({
		discordId: NZAP_TEST_DISCORD_ID,
		discordName: "N-ZAP",
	});

	await flushIfDirty(page);
}

/**
 * Refreshes the server's in-process caches if anything was written since the last
 * flush. Called by the helpers that make the browser talk to the server — tests do
 * not call it themselves.
 */
export async function flushIfDirty(page: Page) {
	const { isDatabaseDirty, markDatabaseClean } = await import(
		"~/db/write-tracker"
	);
	if (!isDatabaseDirty()) return;

	// deliberately not retryPost: that helper calls this one, and would recurse
	const response = await page.request.post("/refresh-caches", {
		timeout: 7_500,
	});
	if (!response.ok()) {
		throw new Error(`Cache refresh failed with status ${response.status()}`);
	}

	markDatabaseClean();
}

/** Fails the test if it ended with factory writes the server was never told about. */
export async function assertFlushed() {
	const { isDatabaseDirty } = await import("~/db/write-tracker");
	if (!isDatabaseDirty()) return;

	throw new Error(
		"Test ended with database writes the server never saw — follow factory calls with a helper that talks to the server (navigate, submit, impersonate)",
	);
}
