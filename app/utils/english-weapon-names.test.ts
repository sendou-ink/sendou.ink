import { describe, expect, test } from "vitest";
import type { AnyWeapon } from "~/features/build-analyzer/analyzer-types";
import { englishWeaponName, weaponSlug } from "./english-weapon-names";

describe("weaponSlug", () => {
	test.each<{ weapon: AnyWeapon; expected: string }>([
		{ weapon: { type: "MAIN", id: 0 }, expected: "sploosh-o-matic" },
		{ weapon: { type: "SUB", id: 0 }, expected: "splat-bomb" },
		{ weapon: { type: "SPECIAL", id: 1 }, expected: "trizooka" },
	])("$weapon.type weapon", ({ weapon, expected }) => {
		expect(weaponSlug(weapon)).toBe(expected);
	});
});

describe("englishWeaponName", () => {
	test("names the weapon in English", () => {
		expect(englishWeaponName({ type: "MAIN", id: 40 })).toBe("Splattershot");
	});
});
