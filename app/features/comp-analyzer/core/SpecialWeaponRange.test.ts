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
import * as SpecialWeaponRange from "./SpecialWeaponRange";

describe("SpecialWeaponRange.ofSpecial", () => {
	test("computes a projectile range for Trizooka", () => {
		const result = SpecialWeaponRange.ofSpecial(TRIZOOKA_ID);

		expect(result?.rangeType).toBe("projectile");
		expect(result?.range).toBeGreaterThan(0);
	});

	test("Crab Tank reaches further than Trizooka", () => {
		const crab = SpecialWeaponRange.ofSpecial(CRAB_TANK_ID);
		const trizooka = SpecialWeaponRange.ofSpecial(TRIZOOKA_ID);

		expect(crab!.range).toBeGreaterThan(trizooka!.range);
	});

	test("throws-and-bursts specials expose a throw range plus explosion blast", () => {
		const booyah = SpecialWeaponRange.ofSpecial(BOOYAH_BOMB_ID);

		expect(booyah?.rangeType).toBe("projectile");
		expect(booyah?.range).toBeGreaterThan(0);
		expect(booyah?.blastRadius).toBeGreaterThan(0);
	});

	test("returns the effect radius for area specials", () => {
		const waveBreaker = SpecialWeaponRange.ofSpecial(WAVE_BREAKER_ID);

		expect(waveBreaker?.rangeType).toBe("radius");
		expect(waveBreaker?.range).toBeGreaterThan(0);
	});

	test("returns null for global / utility specials without a meaningful circle", () => {
		expect(SpecialWeaponRange.ofSpecial(BIG_BUBBLER_ID)).toBeNull();
		expect(SpecialWeaponRange.ofSpecial(SPLATTERCOLOR_SCREEN_ID)).toBeNull();
	});

	test("every special is either unsupported or has a positive finite range", () => {
		for (const id of specialWeaponIds) {
			const result = SpecialWeaponRange.ofSpecial(id);
			if (result === null) continue;

			expect(Number.isFinite(result.range)).toBe(true);
			expect(result.range).toBeGreaterThan(0);
		}
	});
});
