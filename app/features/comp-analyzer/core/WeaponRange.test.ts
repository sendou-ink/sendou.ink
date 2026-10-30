import { describe, expect, test } from "vitest";
import type { RangeVariantKey } from "~/features/build-analyzer/analyzer-types";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import * as WeaponRange from "./WeaponRange";

// [longerRangeWeaponId, shorterRangeWeaponId]
const RANGE_COMPARISONS: [MainWeaponId, MainWeaponId][] = [
	[220, 210], // Range Blaster > Blaster
	[70, 40], // Splattershot Pro > Splattershot
	[7010, 7030], // Tri-Stringer > Wellstring V
	[2020, 7030], // Splatterscope > Wellstring V
	[2070, 7010], // Snipewriter 5H > Tri-Stringer
];

// "Calculating weapon range (11.1.0 ver.)" community sheet, rows whose params didn't change since
const SHEET_RANGES: Array<{
	weaponId: MainWeaponId;
	key: RangeVariantKey | null;
	expected: number;
	why: string;
}> = [
	{ weaponId: 40, key: null, expected: 11.93, why: "Splattershot" },
	{ weaponId: 210, key: null, expected: 9.86, why: "Blaster bursts mid-air" },
	{ weaponId: 250, key: null, expected: 17.39, why: "Rapid Blaster Pro" },
	{ weaponId: 260, key: "jump", expected: 7.77, why: "S-BLAST jump shot" },
	{ weaponId: 400, key: "hold", expected: 11.63, why: "Squeezer hold" },
	{ weaponId: 1010, key: "horizontal", expected: 9.27, why: "Splat Roller" },
	{ weaponId: 1030, key: "horizontal", expected: 8.3, why: "Flingza Roller" },
	{ weaponId: 2060, key: "tap", expected: 12.6, why: "Goo Tuber tap" },
	{ weaponId: 3000, key: null, expected: 11.15, why: "Slosher air resist" },
	{ weaponId: 3040, key: null, expected: 17.39, why: "Explosher" },
	{ weaponId: 4030, key: "short", expected: 10.77, why: "Ballpoint short" },
	{ weaponId: 5020, key: "turret", expected: 15.75, why: "Glooga turret" },
	{ weaponId: 5050, key: "turret", expected: 14.22, why: "Douser turret" },
	{
		weaponId: 7010,
		key: "partialCharge",
		expected: 13.83,
		why: "Tri-Stringer",
	},
	{
		weaponId: 8020,
		key: "charged",
		expected: 16.1,
		why: "Decavitator charged, spawn offset",
	},
	{ weaponId: 8020, key: "tap", expected: 15.2, why: "Decavitator tap" },
];

describe("WeaponRange.ofWeapons", () => {
	test("keeps a separate slot for each copy of a duplicated weapon", () => {
		const weapons = WeaponRange.ofWeapons([40, 40, 70]);

		expect(weapons.map((weapon) => weapon.slot)).toEqual([0, 1, 2]);
	});

	test.each(RANGE_COMPARISONS)(
		"weapon %i has more range than weapon %i",
		(longerId, shorterId) => {
			const [longer] = WeaponRange.ofWeapons([longerId]);
			const [shorter] = WeaponRange.ofWeapons([shorterId]);

			expect(longer.variants[0].range).toBeGreaterThan(
				shorter.variants[0].range,
			);
		},
	);

	test("shows only the default variant when none are enabled", () => {
		const [roller] = WeaponRange.ofWeapons([1010]);

		expect(roller.variants.map((variant) => variant.key)).toEqual(["vertical"]);
		expect(roller.allVariantKeys).toEqual(["vertical", "horizontal"]);
	});

	test("shows the enabled variants in the weapon's own order", () => {
		const [roller] = WeaponRange.ofWeapons([1010], () => [
			"horizontal",
			"vertical",
		]);

		expect(roller.variants.map((variant) => variant.key)).toEqual([
			"vertical",
			"horizontal",
		]);
	});

	test("weapons with one way of shooting have no variant keys", () => {
		const [splattershot] = WeaponRange.ofWeapons([40]);

		expect(splattershot.allVariantKeys).toEqual([]);
		expect(splattershot.variants[0].key).toBeNull();
	});
});

describe("WeaponRange.variantsOf", () => {
	test.each(SHEET_RANGES)(
		"matches the community range sheet: $why",
		({ weaponId, key, expected }) => {
			const variant = WeaponRange.variantsOf(weaponId).find(
				(candidate) => key === null || candidate.key === key,
			);

			expect(variant?.range).toBeCloseTo(expected, 1);
		},
	);

	test("Splatana shots spawn in front of the player at shooting height", () => {
		const [charged, tap] = WeaponRange.variantsOf(8000);

		expect(charged.trajectory?.[0]).toEqual({ z: 0.8, y: 1 });
		expect(tap.trajectory?.[0]).toEqual({ z: 1.4, y: 1 });
	});

	test("vertical roller flicks are launched upwards", () => {
		const [vertical] = WeaponRange.variantsOf(1010);
		const highestPoint = Math.max(
			...(vertical.trajectory ?? []).map((point) => point.y),
		);

		expect(highestPoint).toBeGreaterThan(1);
	});

	test("rollers carry their one-shot distance per swing", () => {
		const [vertical, horizontal] = WeaponRange.variantsOf(1010);

		expect(vertical.lethal).toEqual({ shots: 1, distance: 8.2 });
		expect(horizontal.lethal).toEqual({ shots: 1, distance: 7.2 });
	});
});

describe("WeaponRange.lethalRange", () => {
	test.each([
		{
			why: "ends where damage drops below one-shot",
			points: [
				{ Damage: 1500, Distance: 5.2 },
				{ Damage: 1000, Distance: 8.2 },
				{ Damage: 500, Distance: 11.2 },
			],
			expected: { shots: 1, distance: 8.2 },
		},
		{
			why: "interpolates between points",
			points: [
				{ Damage: 400, Distance: 3.3 },
				{ Damage: 200, Distance: 14.3 },
			],
			expected: { shots: 3, distance: 3.3 + (11 * (400 - 1000 / 3)) / 200 },
		},
		{
			why: "is null when damage never drops a breakpoint",
			points: [
				{ Damage: 600, Distance: 5 },
				{ Damage: 500, Distance: 13 },
			],
			expected: null,
		},
	])("$why", ({ points, expected }) => {
		const result = WeaponRange.lethalRange(points);

		if (expected === null) {
			expect(result).toBeNull();
		} else {
			expect(result?.shots).toBe(expected.shots);
			expect(result?.distance).toBeCloseTo(expected.distance);
		}
	});
});

describe("WeaponRange.simulateTrajectory", () => {
	const params: WeaponRange.TrajectoryParams = {
		spawnSpeed: 1,
		spawnAngle: 0,
		spawnOffsetZ: 0,
		goStraightStateEndMaxSpeed: 1,
		goStraightToBrakeStateFrame: 2,
		freeGravity: 0.016,
		freeAirResist: 0.02,
		brakeAirResist: 0.09,
		brakeGravity: 0.09,
		brakeToFreeFrame: 10,
		brakeToFreeVelocityY: -0.15,
	};

	test("ends the brake phase once the shot falls faster than brakeToFreeVelocityY", () => {
		const earlyFree = WeaponRange.groundRange(
			WeaponRange.simulateTrajectory({ ...params, brakeToFreeVelocityY: -0.1 }),
		);
		const fullBrake = WeaponRange.groundRange(
			WeaponRange.simulateTrajectory({ ...params, brakeToFreeVelocityY: -99 }),
		);

		expect(earlyFree).toBeGreaterThan(fullBrake);
	});
});

describe("WeaponRange.toggleVariant", () => {
	const roller = (enabled: RangeVariantKey[]) =>
		WeaponRange.ofWeapons([1010], () => enabled)[0];

	test.each([
		{
			why: "turning on an alternative keeps the default",
			enabled: [],
			key: "horizontal",
			expected: ["vertical", "horizontal"],
		},
		{
			why: "back to only the default is stored as nothing",
			enabled: ["vertical", "horizontal"],
			key: "horizontal",
			expected: [],
		},
		{
			why: "the default can be hidden while an alternative shows",
			enabled: ["vertical", "horizontal"],
			key: "vertical",
			expected: ["horizontal"],
		},
		{
			why: "the last shown variant can't be hidden",
			enabled: ["horizontal"],
			key: "horizontal",
			expected: null,
		},
	] satisfies Array<{
		why: string;
		enabled: RangeVariantKey[];
		key: RangeVariantKey;
		expected: RangeVariantKey[] | null;
	}>)("$why", ({ enabled, key, expected }) => {
		expect(WeaponRange.toggleVariant(roller(enabled), key)).toEqual(expected);
	});
});
