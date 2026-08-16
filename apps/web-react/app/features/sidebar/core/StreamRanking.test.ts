import { describe, expect, test } from "vitest";
import * as StreamRanking from "./StreamRanking";

describe("StreamRanking.sendouQTierToScore", () => {
	test("LEVIATHAN+ scores 1", () => {
		expect(
			StreamRanking.sendouQTierToScore({ name: "LEVIATHAN", isPlus: true }),
		).toBe(1);
	});

	test("PLATINUM+ scores 5", () => {
		expect(
			StreamRanking.sendouQTierToScore({ name: "PLATINUM", isPlus: true }),
		).toBe(5);
	});

	test("IRON & SILVER+ scores 9 (capped)", () => {
		expect(
			StreamRanking.sendouQTierToScore({ name: "SILVER", isPlus: true }),
		).toBe(9);

		expect(
			StreamRanking.sendouQTierToScore({ name: "IRON", isPlus: false }),
		).toBe(9);
	});
});

describe("StreamRanking.xpToScore", () => {
	test("returns null for XP below 3000", () => {
		expect(StreamRanking.xpToScore(2999)).toBeNull();
		expect(StreamRanking.xpToScore(0)).toBeNull();
	});

	test("3000 XP scores 9", () => {
		expect(StreamRanking.xpToScore(3000)).toBe(9);
	});

	test("3200 XP scores 8", () => {
		expect(StreamRanking.xpToScore(3200)).toBe(8);
	});

	test("3400 XP scores 7", () => {
		expect(StreamRanking.xpToScore(3400)).toBe(7);
	});

	test("3800 XP scores 5 (X rank minimum)", () => {
		expect(StreamRanking.xpToScore(3800)).toBe(5);
	});

	test("XP above 3800 is capped at score 5", () => {
		expect(StreamRanking.xpToScore(4200)).toBe(5);
		expect(StreamRanking.xpToScore(4600)).toBe(5);
		expect(StreamRanking.xpToScore(9999)).toBe(5);
	});
});
