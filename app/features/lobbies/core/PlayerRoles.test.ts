import { describe, expect, test } from "vitest";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import * as PlayerRoles from "./PlayerRoles";

// 40 Splattershot, 2010 Splat Charger, 4020 Hydra Splatling, 8000 Splatana Stamper
describe("PlayerRoles.fromWeaponPool", () => {
	test.each([
		{ why: "empty pool", pool: [], expected: [] },
		{ why: "a shooter", pool: [40], expected: [] },
		{
			why: "mostly long range",
			pool: [2010, 4020, 40],
			expected: ["BACKLINE", "BACKLINE_IN_POOL"],
		},
		{
			why: "half isn't mostly",
			pool: [2010, 40],
			expected: ["BACKLINE_IN_POOL"],
		},
		{ why: "splatana despite its range", pool: [8000], expected: [] },
	] as Array<{
		why: string;
		pool: MainWeaponId[];
		expected: PlayerRoles.PlayerRole[];
	}>)("$why", ({ pool, expected }) => {
		expect(PlayerRoles.fromWeaponPool(pool)).toEqual(expected);
	});
});
