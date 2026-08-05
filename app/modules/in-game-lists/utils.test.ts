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

	const neoSplash = { type: "MAIN" as const, id: 22 as MainWeaponId };

	test("matches a full alt name", () => {
		expect(
			filterWeapon({
				weapon: neoSplash,
				weaponName: "Neo Splash-o-matic",
				searchTerm: "gecko",
			}),
		).toBe(true);
	});

	test("alt names match on the full alt name only, not a partial one", () => {
		expect(
			filterWeapon({
				weapon: neoSplash,
				weaponName: "Neo Splash-o-matic",
				searchTerm: "geck",
			}),
		).toBe(false);
	});

	test("alt names match on the full alt name only, also when the weapon has a single alt name", () => {
		expect(
			filterWeapon({
				weapon: { type: "MAIN", id: 10 as MainWeaponId },
				weaponName: "Splattershot Jr.",
				searchTerm: "vj",
			}),
		).toBe(false);
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
