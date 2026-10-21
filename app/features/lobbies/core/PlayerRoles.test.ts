import { describe, expect, test } from "vitest";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import * as PlayerRoles from "./PlayerRoles";

// 40 Splattershot, 1010 Inkbrush, 2010 Splat Charger, 4020 Hydra Splatling, 1020 Dynamo Roller
describe("PlayerRoles.fromWeaponPool", () => {
	test.each([
		{ why: "empty pool", pool: [], expected: [] },
		{ why: "a shooter", pool: [40], expected: [] },
		{
			why: "mostly long range",
			pool: [2010, 4020, 40],
			expected: ["BACKLINE"],
		},
		{ why: "half isn't mostly", pool: [2010, 40], expected: [] },
	] as Array<{
		why: string;
		pool: MainWeaponId[];
		expected: PlayerRoles.PlayerRole[];
	}>)("$why", ({ pool, expected }) => {
		expect(PlayerRoles.fromWeaponPool(pool)).toEqual(expected);
	});
});

describe("PlayerRoles thresholds", () => {
	test("the backline range sits between Splatana Stamper and Jet Squelcher", () => {
		expect(PlayerRoles.BACKLINE_MIN_RANGE).toBeGreaterThan(20.8);
		expect(PlayerRoles.BACKLINE_MIN_RANGE).toBeLessThan(21.1);
	});

	test("mostly means more than the threshold share of the pool", () => {
		// one of two long range weapons is exactly half
		expect(PlayerRoles.ROLE_POOL_SHARE_THRESHOLD).toBe(0.5);
		expect(PlayerRoles.fromWeaponPool([2010, 40])).toEqual([]);
	});
});
