import { describe, expect, test } from "vitest";
import { weaponIdToArrayWithAlts, weaponIdToBaseWeaponId } from "./weapon-ids";

describe("weaponIdToArrayWithAlts", () => {
	test("handles weapon id without alts", () => {
		const id = 0;
		const result = weaponIdToArrayWithAlts(id);
		expect(result).toEqual([0]);
	});

	test("handles weapon id with alts", () => {
		const id = 40;
		const result = weaponIdToArrayWithAlts(id);
		expect(result).toEqual([40, 45, 47]);
	});

	test("handles alt weapon id", () => {
		const id = 45;
		const result = weaponIdToArrayWithAlts(id);
		expect(result).toEqual([40, 45, 47]);
	});

	test("handles weapon id with only one alt", () => {
		const id = 41;
		const result = weaponIdToArrayWithAlts(id);
		expect(result).toEqual([41, 46]);
	});
});

describe("weaponIdToBaseWeaponId()", () => {
	test("returns correct IDs for 2nd & 3rd kit", () => {
		expect(weaponIdToBaseWeaponId(210)).toBe(210);
		expect(weaponIdToBaseWeaponId(211)).toBe(210);
		expect(weaponIdToBaseWeaponId(212)).toBe(210);
	});

	test("returns correct ID for alt kits", () => {
		expect(weaponIdToBaseWeaponId(45)).toBe(40);
		expect(weaponIdToBaseWeaponId(47)).toBe(40);
	});
});
