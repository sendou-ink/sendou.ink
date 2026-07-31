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

// after updating some packages got
// Error: Cannot find module '/Users/kalle/Documents/personal/repos/sendou.ink/node_modules/@aws-sdk/core/dist-es/submodules/client/index' imported from
// this is a workaround for that, if sometime in future unit tests pass without these then this can be deleted

vi.mock("@aws-sdk/client-s3", () => ({
	S3: vi.fn(() => ({})),
}));

vi.mock("@aws-sdk/lib-storage", () => ({
	Upload: vi.fn(() => ({
		done: vi.fn(() => Promise.resolve({})),
	})),
}));
