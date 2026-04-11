import { describe, expect, test } from "vitest";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { getWeaponsWithRange } from "./weapon-range";

// [longerRangeWeaponId, shorterRangeWeaponId]
const RANGE_COMPARISONS: [MainWeaponId, MainWeaponId][] = [
	[220, 210], // Range Blaster > Blaster
	[70, 40], // Splattershot Pro > Splattershot
	[7010, 7030], // Tri-Stringer > Wellstring V
	[2020, 7030], // Splatterscope > Wellstring V
	[2070, 7010], // Snipewriter 5H > Tri-Stringer
];

describe("weapon range comparisons", () => {
	test.each(
		RANGE_COMPARISONS,
	)("weapon %i has more range than weapon %i", (longerId, shorterId) => {
		const [longer] = getWeaponsWithRange([longerId]);
		const [shorter] = getWeaponsWithRange([shorterId]);

		expect(longer.range).toBeGreaterThan(shorter.range);
	});
});
