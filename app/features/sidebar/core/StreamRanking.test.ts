import { describe, expect, it } from "vitest";
import * as StreamRanking from "./StreamRanking";

describe("StreamRanking.sendouQTierToScore", () => {
	it("LEVIATHAN+ scores 1", () => {
		expect(
			StreamRanking.sendouQTierToScore({ name: "LEVIATHAN", isPlus: true }),
		).toBe(1);
	});

	it("PLATINUM+ scores 5", () => {
		expect(
			StreamRanking.sendouQTierToScore({ name: "PLATINUM", isPlus: true }),
		).toBe(5);
	});

	it("IRON & SILVER+ scores 9 (capped)", () => {
		expect(
			StreamRanking.sendouQTierToScore({ name: "SILVER", isPlus: true }),
		).toBe(9);

		expect(
			StreamRanking.sendouQTierToScore({ name: "IRON", isPlus: false }),
		).toBe(9);
	});
});

describe("StreamRanking.xpToScore", () => {
	it("returns null for XP below 3000", () => {
		expect(StreamRanking.xpToScore(2999)).toBeNull();
		expect(StreamRanking.xpToScore(0)).toBeNull();
	});

	it("3000 XP scores 9", () => {
		expect(StreamRanking.xpToScore(3000)).toBe(9);
	});

	it("3200 XP scores 8", () => {
		expect(StreamRanking.xpToScore(3200)).toBe(8);
	});

	it("3400 XP scores 7", () => {
		expect(StreamRanking.xpToScore(3400)).toBe(7);
	});

	it("3800 XP scores 5 (X rank minimum)", () => {
		expect(StreamRanking.xpToScore(3800)).toBe(5);
	});

	it("XP above 3800 is capped at score 5", () => {
		expect(StreamRanking.xpToScore(4200)).toBe(5);
		expect(StreamRanking.xpToScore(4600)).toBe(5);
		expect(StreamRanking.xpToScore(9999)).toBe(5);
	});
});
