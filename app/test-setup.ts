import { afterEach, vi } from "vitest";
import { isDatabaseDirty } from "~/db/write-tracker";

// Wipes the database after any test that wrote to it, so no test has to remember to.
// The flag keeps this free for the tests that never touch the database — importing
// `~/db/reset` would open the connection for them too, hence the dynamic import.
afterEach(async () => {
	if (!isDatabaseDirty()) return;

	const { dbReset } = await import("~/db/reset");
	await dbReset();
});

// mocking the AWS SDK avoids a "Cannot find module '@aws-sdk/core/dist-es/submodules/client/index'"
// error in unit tests, can be deleted if they pass without these

vi.mock("@aws-sdk/client-s3", () => ({
	S3: vi.fn(() => ({})),
}));

vi.mock("@aws-sdk/lib-storage", () => ({
	Upload: vi.fn(() => ({
		done: vi.fn(() => Promise.resolve({})),
	})),
}));
