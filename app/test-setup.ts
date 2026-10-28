import { afterEach } from "bun:test";
import { isDatabaseDirty } from "~/db/write-tracker";

// Vite defines it at build time
Object.assign(globalThis, { __GIT_COMMIT__: "" });

// wipes the database after any test that wrote to it; the dynamic import keeps
// tests that never touch the database from opening the connection
afterEach(async () => {
	if (!isDatabaseDirty()) return;

	const { dbReset } = await import("~/db/reset");
	await dbReset();
}, 30_000);
