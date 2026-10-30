import { describe, expect, test } from "vitest";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { weaponIdToBaseWeaponId } from "~/modules/in-game-lists/weapon-ids";
import { seededRandom } from "~/utils/random";
import * as WeaponRoll from "./WeaponRoll";

const SPLATTERSHOT: MainWeaponId = 40;
const SPLATTERSHOT_PRO: MainWeaponId = 70;
const JET_SQUELCHER: MainWeaponId = 90;
const SPLAT_ROLLER: MainWeaponId = 1010;
const DYNAMO_ROLLER: MainWeaponId = 1020;
const BAMBOOZLER: MainWeaponId = 2060;
const SPLAT_CHARGER: MainWeaponId = 2010;
const SLOSHER: MainWeaponId = 3000;
const HEAVY_SPLATLING_DECO: MainWeaponId = 4011;

const seeded = (seed: string) => {
	const { random } = seededRandom(seed);
	return () => random();
};

describe("WeaponRoll.roll", () => {
	test.each(["a", "b", "c"])(
		"rolls 8 rollable weapons of different base weapons (seed %s)",
		(seed) => {
			const result = WeaponRoll.roll(WeaponRoll.DEFAULT_WEAPON_ROLL_OPTIONS, {
				random: seeded(seed),
			});
			const weapons = [...result.alpha, ...result.bravo];

			expect(result.alpha).toHaveLength(4);
			expect(result.bravo).toHaveLength(4);
			expect(new Set(weapons.map(weaponIdToBaseWeaponId)).size).toBe(8);
			for (const weaponId of weapons) {
				expect(WeaponRoll.ROLLABLE_WEAPON_IDS).toContain(weaponId);
			}
		},
	);

	test("more candidates never cost more than the plain roll drawn from the same randomness", () => {
		const options = WeaponRoll.DEFAULT_WEAPON_ROLL_OPTIONS;

		const plain = WeaponRoll.roll(
			{ ...options, candidates: 1 },
			{ random: seeded("x") },
		);
		const tuned = WeaponRoll.roll(
			{ ...options, candidates: 50 },
			{ random: seeded("x") },
		);

		expect(tuned.cost.total).toBeLessThanOrEqual(plain.cost.total);
	});

	test("never repeats a base weapon of the previous set when repeats weigh 0", () => {
		const options = {
			...WeaponRoll.DEFAULT_WEAPON_ROLL_OPTIONS,
			repeatWeight: 0,
		};
		let previous = WeaponRoll.roll(options, { random: seeded("start") });

		for (let i = 0; i < 20; i++) {
			const previousWeapons = [...previous.alpha, ...previous.bravo];
			const next = WeaponRoll.roll(options, {
				recentRolls: [previousWeapons],
				random: seeded(`set-${i}`),
			});
			const previousBaseIds = previousWeapons.map(weaponIdToBaseWeaponId);

			for (const weaponId of [...next.alpha, ...next.bravo]) {
				expect(previousBaseIds).not.toContain(weaponIdToBaseWeaponId(weaponId));
			}
			previous = next;
		}
	});
});

describe("WeaponRoll.repeatFactor", () => {
	test.each([
		{ setsAgo: 1, expected: 0.25 },
		{ setsAgo: 2, expected: 0.5 },
		{ setsAgo: 3, expected: 0.75 },
		{ setsAgo: 4, expected: 1 },
	])("$setsAgo sets ago is $expected", ({ setsAgo, expected }) => {
		expect(
			WeaponRoll.repeatFactor(
				{ repeatWeight: 0.25, repeatFadeSets: 3 },
				setsAgo,
			),
		).toBeCloseTo(expected);
	});
});

describe("WeaponRoll.rollForSet", () => {
	test("a chaotic roll never gives two kits of the same base weapon", () => {
		for (let i = 0; i < 200; i++) {
			const { ALPHA, BRAVO } = WeaponRoll.rollForSet("CHAOTIC");

			expect(
				new Set([...ALPHA, ...BRAVO].map(weaponIdToBaseWeaponId)).size,
			).toBe(8);
		}
	});
});

describe("WeaponRoll.tierOf", () => {
	test.each([
		{ why: "short range shooter", weaponId: SPLATTERSHOT, tier: "FRONTLINE" },
		{ why: "mid range shooter", weaponId: SPLATTERSHOT_PRO, tier: "MIDLINE" },
		{ why: "long range shooter", weaponId: JET_SQUELCHER, tier: "BACKLINE" },
		{
			why: "roller despite flick range",
			weaponId: DYNAMO_ROLLER,
			tier: "FRONTLINE",
		},
		{
			why: "charger despite short range",
			weaponId: BAMBOOZLER,
			tier: "BACKLINE",
		},
		{
			why: "alt kit of a weapon with a tier set by hand",
			weaponId: HEAVY_SPLATLING_DECO,
			tier: "BACKLINE",
		},
	] as const)("$why", ({ weaponId, tier }) => {
		expect(WeaponRoll.tierOf(weaponId)).toBe(tier);
	});
});

describe("WeaponRoll.shapeMismatchCost", () => {
	test.each([
		{
			why: "same shape",
			alpha: [SPLATTERSHOT, SPLAT_ROLLER, SLOSHER, SPLAT_CHARGER],
			bravo: [DYNAMO_ROLLER, SPLATTERSHOT, SLOSHER, BAMBOOZLER],
			expected: 0,
		},
		{
			why: "one player in a different tier",
			alpha: [SPLATTERSHOT, SPLAT_ROLLER, SLOSHER, SPLAT_CHARGER],
			bravo: [SPLATTERSHOT, SPLAT_ROLLER, SLOSHER, SPLATTERSHOT_PRO],
			expected: 1,
		},
		{
			why: "two backlines against none",
			alpha: [SPLATTERSHOT, SPLAT_ROLLER, SPLAT_CHARGER, BAMBOOZLER],
			bravo: [SPLATTERSHOT, SPLAT_ROLLER, SLOSHER, SPLATTERSHOT_PRO],
			expected: 2,
		},
	] satisfies Array<{
		why: string;
		alpha: MainWeaponId[];
		bravo: MainWeaponId[];
		expected: number;
	}>)("$why", ({ alpha, bravo, expected }) => {
		expect(WeaponRoll.shapeMismatchCost(alpha, bravo)).toBe(expected);
	});
});

describe("WeaponRoll.specialStackCost", () => {
	test("counts the weapons sharing a special with a teammate", () => {
		expect(
			WeaponRoll.specialStackCost([
				SPLATTERSHOT,
				SPLATTERSHOT,
				SPLATTERSHOT,
				SPLAT_CHARGER,
			]),
		).toBe(2);
	});
});

describe("WeaponRoll.winProbability", () => {
	const alpha = [SPLATTERSHOT, SPLAT_ROLLER, SLOSHER, SPLAT_CHARGER];
	const bravo = [DYNAMO_ROLLER, JET_SQUELCHER, SPLATTERSHOT_PRO, BAMBOOZLER];

	test("is even for identical teams", () => {
		expect(WeaponRoll.winProbability(alpha, alpha, "SZ")).toBe(0.5);
	});

	test("is symmetric between the sides", () => {
		expect(
			WeaponRoll.winProbability(alpha, bravo, null) +
				WeaponRoll.winProbability(bravo, alpha, null),
		).toBeCloseTo(1);
	});
});
