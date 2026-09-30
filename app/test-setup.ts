import { afterEach, vi } from "vitest";
import { isDatabaseDirty } from "~/db/write-tracker";

// wipes the database after any test that wrote to it; the dynamic import keeps
// tests that never touch the database from opening the connection
afterEach(async () => {
	if (!isDatabaseDirty()) return;

	const { dbReset } = await import("~/db/reset");
	await dbReset();
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
