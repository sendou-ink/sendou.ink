import { describe, expect, test } from "vitest";
import type { MainWeaponId } from "./types";
import { filterWeapon } from "./utils";

describe("filterWeapon", () => {
	const sBlast = { type: "MAIN" as const, id: 260 as MainWeaponId };

	test("matches ignoring hyphens (e.g. 's blast' finds 'S-BLAST')", () => {
		expect(
			filterWeapon({
				weapon: sBlast,
				weaponName: "S-BLAST '92",
				searchTerm: "s blast",
			}),
		).toBe(true);
	});

	test("matches with the hyphen still present", () => {
		expect(
			filterWeapon({
				weapon: sBlast,
				weaponName: "S-BLAST '92",
				searchTerm: "s-blast",
			}),
		).toBe(true);
	});

	test("matches ignoring case", () => {
		expect(
			filterWeapon({
				weapon: sBlast,
				weaponName: "S-BLAST '92",
				searchTerm: "SBLAST",
			}),
		).toBe(true);
	});

	test("does not match unrelated weapon", () => {
		expect(
			filterWeapon({
				weapon: sBlast,
				weaponName: "S-BLAST '92",
				searchTerm: "splattershot",
			}),
		).toBe(false);
	});
});
