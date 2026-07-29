import { beforeEach, describe, expect, test, vi } from "vitest";
import { decompressFromBase64 } from "~/utils/compression";
import { decompressTrophyModel } from "./trophies-utils";

vi.mock("~/utils/compression", () => ({
	compressToBase64: vi.fn((value: string) => value),
	decompressFromBase64: vi.fn((_compressed: string): string | null => null),
}));

const decompressMock = vi.mocked(decompressFromBase64);

const ENTRY_CHARS = 3_500_000;

describe("decompressTrophyModel", () => {
	beforeEach(() => {
		decompressMock.mockReset();
	});

	test("decompresses each distinct model once", () => {
		flushCache("once");
		decompressMock.mockImplementation((key) => `decompressed-${key}`);

		expect(decompressTrophyModel("once-model")).toBe("decompressed-once-model");
		expect(decompressTrophyModel("once-model")).toBe("decompressed-once-model");
		expect(callsFor("once-model")).toBe(1);
	});

	test("caches null results of corrupt models", () => {
		flushCache("corrupt");
		decompressMock.mockImplementation(() => null);

		expect(decompressTrophyModel("corrupt-model")).toBe(null);
		expect(decompressTrophyModel("corrupt-model")).toBe(null);
		expect(callsFor("corrupt-model")).toBe(1);
	});

	test("evicts the least recently used entry when over the character budget", () => {
		flushCache("lru");
		decompressMock.mockImplementation(() => "x".repeat(ENTRY_CHARS));

		decompressTrophyModel("lru-a");
		decompressTrophyModel("lru-b");
		decompressTrophyModel("lru-c");
		decompressTrophyModel("lru-d");

		decompressTrophyModel("lru-a");
		expect(callsFor("lru-a")).toBe(1);

		decompressTrophyModel("lru-e");

		expect(decompressTrophyModel("lru-a")?.length).toBe(ENTRY_CHARS);
		expect(callsFor("lru-a")).toBe(1);

		decompressTrophyModel("lru-b");
		expect(callsFor("lru-b")).toBe(2);
	});
});

function callsFor(key: string) {
	return decompressMock.mock.calls.filter(([arg]) => arg === key).length;
}

function flushCache(prefix: string) {
	decompressMock.mockImplementation(() => "x".repeat(17 * 1024 * 1024));
	decompressTrophyModel(`${prefix}-flush-filler`);
	decompressMock.mockImplementation(() => "");
	decompressTrophyModel(`${prefix}-flush-remainder`);
}
