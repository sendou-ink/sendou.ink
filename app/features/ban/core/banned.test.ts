import { describe, expect, test } from "vitest";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { checkBanStatus } from "./banned.server";

describe("checkBanStatus", () => {
	test("returns false when banned is null", () => {
		expect(checkBanStatus(null)).toBe(false);
	});

	test("returns false when banned is undefined", () => {
		expect(checkBanStatus(undefined)).toBe(false);
	});

	test("returns false when banned is 0", () => {
		expect(checkBanStatus(0)).toBe(false);
	});

	test("returns true when banned is 1 (permanent ban)", () => {
		expect(checkBanStatus(1)).toBe(true);
	});

	test("returns true when ban expires in the future", () => {
		const now = new Date("2025-01-01T12:00:00Z");
		const futureTimestamp = dateToDatabaseTimestamp(
			new Date("2025-01-01T13:00:00Z"),
		);

		expect(checkBanStatus(futureTimestamp, now)).toBe(true);
	});

	test("returns false when ban has expired", () => {
		const now = new Date("2025-01-01T12:00:00Z");
		const pastTimestamp = dateToDatabaseTimestamp(
			new Date("2025-01-01T11:00:00Z"),
		);

		expect(checkBanStatus(pastTimestamp, now)).toBe(false);
	});

	test("returns false when ban expires exactly at current time", () => {
		const now = new Date("2025-01-01T12:00:00Z");
		const exactTimestamp = dateToDatabaseTimestamp(now);

		expect(checkBanStatus(exactTimestamp, now)).toBe(false);
	});

	test("returns true when ban expires 1 second in the future", () => {
		const now = new Date("2025-01-01T12:00:00Z");
		const oneSecondLater = dateToDatabaseTimestamp(now) + 1;

		expect(checkBanStatus(oneSecondLater, now)).toBe(true);
	});

	test("returns false when ban expired 1 second ago", () => {
		const now = new Date("2025-01-01T12:00:00Z");
		const oneSecondEarlier = dateToDatabaseTimestamp(now) - 1;

		expect(checkBanStatus(oneSecondEarlier, now)).toBe(false);
	});
});
