import { afterEach } from "vitest";
import { isDatabaseDirty } from "~/db/write-tracker";

// wipes the database after any test that wrote to it; the dynamic import keeps
// tests that never touch the database from opening the connection
afterEach(async () => {
	if (!isDatabaseDirty()) return;

	const { dbReset } = await import("~/db/reset");
	await dbReset();
}, 30_000);
