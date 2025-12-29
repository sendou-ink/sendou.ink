import { vi } from "vitest";

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
