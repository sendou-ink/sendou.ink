import { afterAll, afterEach, vi } from "vitest";
import {
	isDatabaseDirty,
	isDatabaseQueried,
	markDatabaseUnqueried,
} from "~/db/write-tracker";

// wipes the database after any test that wrote to it and drops the in-process state read from it;
// the dynamic imports keep tests that never touch the database from opening the connection
afterEach(async () => {
	if (isDatabaseDirty()) {
		const { dbReset } = await import("~/db/reset");
		await dbReset();
	}

	if (!isDatabaseQueried()) return;

	const { refreshCaches } = await import(
		"~/features/api-private/core/refresh-caches.server"
	);
	const { cache } = await import("~/utils/cache.server");

	await refreshCaches();
	// refreshing warms lazy caches from the wiped database, the next test's writes would find them stale
	cache.clear();
	markDatabaseUnqueried();
}, 30_000);

// the unit project shares the module cache across files, so a file's fake timers would outlive it
afterAll(() => {
	vi.useRealTimers();
});

// avoids a "Cannot find module '@aws-sdk/core/dist-es/submodules/client/index'" error, delete if tests pass without

vi.mock("@aws-sdk/client-s3", () => ({
	S3: vi.fn(() => ({})),
}));

vi.mock("@aws-sdk/lib-storage", () => ({
	Upload: vi.fn(() => ({
		done: vi.fn(() => Promise.resolve({})),
	})),
}));
