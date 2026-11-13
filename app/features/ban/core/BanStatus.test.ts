import { describe, expect, test } from "vitest";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as BanStatus from "./BanStatus";

const NOW = new Date("2025-01-01T12:00:00Z");
const NOW_TIMESTAMP = dateToDatabaseTimestamp(NOW);

describe("BanStatus.isActive", () => {
	test.each([
		{ why: "null", banned: null, expected: false },
		{ why: "undefined", banned: undefined, expected: false },
		{ why: "0, no ban", banned: 0, expected: false },
		{ why: "1, a ban without an end", banned: 1, expected: true },
		{ why: "ends in an hour", banned: NOW_TIMESTAMP + 3600, expected: true },
		{ why: "ends in a second", banned: NOW_TIMESTAMP + 1, expected: true },
		{ why: "ends exactly now", banned: NOW_TIMESTAMP, expected: false },
		{ why: "ended a second ago", banned: NOW_TIMESTAMP - 1, expected: false },
		{ why: "ended an hour ago", banned: NOW_TIMESTAMP - 3600, expected: false },
	])("$why", ({ banned, expected }) => {
		expect(BanStatus.isActive(banned, NOW)).toBe(expected);
	});
});

describe("BanStatus.endsAt", () => {
	test.each([
		{ why: "null", banned: null },
		{ why: "0, no ban", banned: 0 },
		{ why: "1, a ban without an end", banned: 1 },
	])("is null for $why", ({ banned }) => {
		expect(BanStatus.endsAt(banned)).toBeNull();
	});

	test("is the date a timed ban lifts at", () => {
		expect(BanStatus.endsAt(NOW_TIMESTAMP)).toEqual(NOW);
	});
});
