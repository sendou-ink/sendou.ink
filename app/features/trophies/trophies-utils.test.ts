import { addWeeks, subDays } from "date-fns";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { decompressFromBase64 } from "~/utils/compression";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import {
	canAccessTrophies,
	decompressTrophyModel,
	hasUpcomingTournamentSoon,
} from "./trophies-utils";

vi.mock("~/utils/compression", () => ({
	compressToBase64: vi.fn((value: string) => value),
	decompressFromBase64: vi.fn((_compressed: string): string | null => null),
}));

// pinned to unreleased so the role gating stays covered whatever the real flag says
vi.mock("./trophies-constants", async (importOriginal) => ({
	...(await importOriginal<typeof import("./trophies-constants")>()),
	TROPHIES_RELEASED: false,
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

describe("canAccessTrophies (before release)", () => {
	test("true for admin", () => {
		expect(canAccessTrophies({ roles: ["ADMIN"] })).toBe(true);
	});

	test("true for QA", () => {
		expect(canAccessTrophies({ roles: ["QA"] })).toBe(true);
	});

	test("false for staff", () => {
		expect(canAccessTrophies({ roles: ["STAFF"] })).toBe(false);
	});

	test("false for regular and logged out users", () => {
		expect(canAccessTrophies({ roles: [] })).toBe(false);
		expect(canAccessTrophies(null)).toBe(false);
	});
});

describe("hasUpcomingTournamentSoon", () => {
	test("false for a trophy without an upcoming tournament", () => {
		expect(hasUpcomingTournamentSoon(null)).toBe(false);
	});

	test("true for a start time within the window", () => {
		expect(
			hasUpcomingTournamentSoon(
				dateToDatabaseTimestamp(addWeeks(new Date(), 2)),
			),
		).toBe(true);
	});

	test("false for a start time in the past", () => {
		expect(
			hasUpcomingTournamentSoon(
				dateToDatabaseTimestamp(subDays(new Date(), 1)),
			),
		).toBe(false);
	});

	test("false for a start time beyond the window", () => {
		expect(
			hasUpcomingTournamentSoon(
				dateToDatabaseTimestamp(addWeeks(new Date(), 5)),
			),
		).toBe(false);
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
