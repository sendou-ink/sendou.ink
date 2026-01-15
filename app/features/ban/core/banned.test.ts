import { describe, expect, it } from "vitest";
import { checkBanStatus } from "./banned.server";

describe("checkBanStatus", () => {
	it("returns false when banned is null", () => {
		expect(checkBanStatus(null)).toBe(false);
	});

	it("returns false when banned is undefined", () => {
		expect(checkBanStatus(undefined)).toBe(false);
	});

	it("returns false when banned is 0", () => {
		expect(checkBanStatus(0)).toBe(false);
	});

	it("returns true when banned is 1 (permanent ban)", () => {
		expect(checkBanStatus(1)).toBe(true);
	});

	it("returns true when ban expires in the future", () => {
		const now = new Date("2025-01-01T12:00:00Z");
		const futureTimestamp = Math.floor(
			new Date("2025-01-01T13:00:00Z").getTime() / 1000,
		);

		expect(checkBanStatus(futureTimestamp, now)).toBe(true);
	});

	it("returns false when ban has expired", () => {
		const now = new Date("2025-01-01T12:00:00Z");
		const pastTimestamp = Math.floor(
			new Date("2025-01-01T11:00:00Z").getTime() / 1000,
		);

		expect(checkBanStatus(pastTimestamp, now)).toBe(false);
	});

	it("returns false when ban expires exactly at current time", () => {
		const now = new Date("2025-01-01T12:00:00Z");
		const exactTimestamp = Math.floor(now.getTime() / 1000);

		expect(checkBanStatus(exactTimestamp, now)).toBe(false);
	});

	it("returns true when ban expires 1 second in the future", () => {
		const now = new Date("2025-01-01T12:00:00Z");
		const oneSecondLater = Math.floor(now.getTime() / 1000) + 1;

		expect(checkBanStatus(oneSecondLater, now)).toBe(true);
	});

	it("returns false when ban expired 1 second ago", () => {
		const now = new Date("2025-01-01T12:00:00Z");
		const oneSecondEarlier = Math.floor(now.getTime() / 1000) - 1;

		expect(checkBanStatus(oneSecondEarlier, now)).toBe(false);
	});
});
