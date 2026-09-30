import { describe, expect, test } from "vitest";
import {
	BIG_BUBBLER_ID,
	BOOYAH_BOMB_ID,
	CRAB_TANK_ID,
	SPLATTERCOLOR_SCREEN_ID,
	specialWeaponIds,
	TRIZOOKA_ID,
	WAVE_BREAKER_ID,
} from "~/modules/in-game-lists/weapon-ids";
import { getSpecialWeaponRange } from "./special-weapon-range";

describe("special weapon range", () => {
	test("computes a projectile range for Trizooka", () => {
		const result = getSpecialWeaponRange(TRIZOOKA_ID);

		expect(result?.rangeType).toBe("projectile");
		expect(result?.range).toBeGreaterThan(0);
	});

	test("Crab Tank reaches further than Trizooka", () => {
		const crab = getSpecialWeaponRange(CRAB_TANK_ID);
		const trizooka = getSpecialWeaponRange(TRIZOOKA_ID);

		expect(crab!.range).toBeGreaterThan(trizooka!.range);
	});

	test("throws-and-bursts specials expose a throw range plus explosion blast", () => {
		const booyah = getSpecialWeaponRange(BOOYAH_BOMB_ID);

		expect(booyah?.rangeType).toBe("projectile");
		expect(booyah?.range).toBeGreaterThan(0);
		expect(booyah?.blastRadius).toBeGreaterThan(0);
	});

	test("returns the effect radius for area specials", () => {
		const waveBreaker = getSpecialWeaponRange(WAVE_BREAKER_ID);

		expect(waveBreaker?.rangeType).toBe("radius");
		expect(waveBreaker?.range).toBeGreaterThan(0);
	});

	test("returns null for global / utility specials without a meaningful circle", () => {
		expect(getSpecialWeaponRange(BIG_BUBBLER_ID)).toBeNull();
		expect(getSpecialWeaponRange(SPLATTERCOLOR_SCREEN_ID)).toBeNull();
	});

	test("every special is either unsupported or has a positive finite range", () => {
		for (const id of specialWeaponIds) {
			const result = getSpecialWeaponRange(id);
			if (result === null) continue;

			expect(Number.isFinite(result.range)).toBe(true);
			expect(result.range).toBeGreaterThan(0);
		}
	});
});
