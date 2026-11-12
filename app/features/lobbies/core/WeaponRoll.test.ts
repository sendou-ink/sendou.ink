import * as R from "remeda";
import { describe, expect, test } from "vitest";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	SPLATTERCOLOR_SCREEN_ID,
	weaponIdToBaseWeaponId,
} from "~/modules/in-game-lists/weapon-ids";
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

const NO_BALANCING: WeaponRoll.WeaponRollOptions = {
	...WeaponRoll.DEFAULT_WEAPON_ROLL_OPTIONS,
	candidates: 1,
	strengthWeight: 0,
	shapeWeight: 0,
	shapeMismatchWeight: 0,
	specialStackWeight: 0,
};

const hasScreen = (weapons: MainWeaponId[]) =>
	weapons.some(
		(weaponId) => WeaponRoll.specialOf(weaponId) === SPLATTERCOLOR_SCREEN_ID,
	);

/** Every 4v4 split of the 8 weapons. */
const splitsOf = (weapons: MainWeaponId[]) => {
	const [first, ...rest] = weapons;
	const result: Array<{ alpha: MainWeaponId[]; bravo: MainWeaponId[] }> = [];
	for (let a = 0; a < rest.length; a++) {
		for (let b = a + 1; b < rest.length; b++) {
			for (let c = b + 1; c < rest.length; c++) {
				const alpha = [first, rest[a], rest[b], rest[c]];
				result.push({
					alpha,
					bravo: weapons.filter((weaponId) => !alpha.includes(weaponId)),
				});
			}
		}
	}

	return result;
};

const strengthById = (weaponId: MainWeaponId) =>
	WeaponRoll.WEAPON_ROLL_DATA.weapons[weaponId].strength;

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

	test.each([
		{
			why: "strength",
			weight: "strengthWeight",
			measure: (alpha: MainWeaponId[], bravo: MainWeaponId[]) =>
				Math.abs(WeaponRoll.winProbability(alpha, bravo, null) - 0.5),
		},
		{
			why: "how rare the team shapes are",
			weight: "shapeWeight",
			measure: (alpha: MainWeaponId[], bravo: MainWeaponId[]) =>
				-Math.log(
					WeaponRoll.shapeShare(WeaponRoll.shapeKey(alpha)) *
						WeaponRoll.shapeShare(WeaponRoll.shapeKey(bravo)),
				),
		},
		{
			why: "how differently the teams are shaped",
			weight: "shapeMismatchWeight",
			measure: WeaponRoll.shapeMismatchCost,
		},
		{
			why: "shared specials",
			weight: "specialStackWeight",
			measure: (alpha: MainWeaponId[], bravo: MainWeaponId[]) =>
				WeaponRoll.specialStackCost(alpha) + WeaponRoll.specialStackCost(bravo),
		},
	] as const)(
		"weighing only $why, the 8 rolled weapons are split the best way for it",
		({ weight, measure }) => {
			for (let i = 0; i < 10; i++) {
				const result = WeaponRoll.roll(
					{ ...NO_BALANCING, [weight]: 1 },
					{ random: seeded(`${weight}-${i}`) },
				);
				const best = Math.min(
					...splitsOf([...result.alpha, ...result.bravo]).map((split) =>
						measure(split.alpha, split.bravo),
					),
				);

				expect(measure(result.alpha, result.bravo)).toBeLessThanOrEqual(
					best + 1e-9,
				);
			}
		},
	);

	test("with popularity weighed fully, popular weapons are rolled more often than rare ones", () => {
		const byUsage = R.sortBy(WeaponRoll.ROLLABLE_WEAPON_IDS, (weaponId) =>
			WeaponRoll.usageOf(weaponId),
		);
		const rare = byUsage.slice(0, 10);
		const popular = byUsage.slice(-10);

		let rareCount = 0;
		let popularCount = 0;
		for (let i = 0; i < 100; i++) {
			const result = WeaponRoll.roll(
				{ ...NO_BALANCING, popularityExponent: 1 },
				{ random: seeded(`popularity-${i}`) },
			);
			for (const weaponId of [...result.alpha, ...result.bravo]) {
				if (rare.includes(weaponId)) rareCount++;
				if (popular.includes(weaponId)) popularCount++;
			}
		}

		expect(popularCount).toBeGreaterThan(rareCount);
	});

	test("weapons of sets older than the repeat penalty lasts don't affect the roll", () => {
		const options = { ...NO_BALANCING, repeatWeight: 0, repeatFadeSets: 1 };

		const withOldSet = WeaponRoll.roll(options, {
			recentRolls: [[], WeaponRoll.ROLLABLE_WEAPON_IDS],
			random: seeded("old"),
		});
		const withoutHistory = WeaponRoll.roll(options, { random: seeded("old") });

		expect(withOldSet.alpha).toEqual(withoutHistory.alpha);
		expect(withOldSet.bravo).toEqual(withoutHistory.bravo);
	});

	test("rolls weapons with Splattercolor Screen when nobody avoids it", () => {
		const rolls = Array.from({ length: 20 }, (_, i) =>
			WeaponRoll.roll(NO_BALANCING, { random: seeded(`screen-${i}`) }),
		);

		expect(
			rolls.some((result) => hasScreen([...result.alpha, ...result.bravo])),
		).toBe(true);
	});

	test("never rolls a weapon with Splattercolor Screen when avoiding it", () => {
		for (let i = 0; i < 50; i++) {
			const result = WeaponRoll.roll(WeaponRoll.DEFAULT_WEAPON_ROLL_OPTIONS, {
				noScreen: true,
				random: seeded(`no-screen-${i}`),
			});

			for (const weaponId of [...result.alpha, ...result.bravo]) {
				expect(WeaponRoll.specialOf(weaponId)).not.toBe(
					SPLATTERCOLOR_SCREEN_ID,
				);
			}
		}
	});
});

describe("WeaponRoll.repeatFactor", () => {
	test.each([
		{ setsAgo: 1, expected: 0.25 },
		{ setsAgo: 2, expected: 0.5 },
		{ setsAgo: 3, expected: 0.75 },
		{ setsAgo: 4, expected: 1 },
		{ setsAgo: 10, expected: 1 },
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

	test("rolls weapons with Splattercolor Screen when no player avoids it", () => {
		const rolls = Array.from({ length: 100 }, () =>
			WeaponRoll.rollForSet("CHAOTIC"),
		);

		expect(
			rolls.some(({ ALPHA, BRAVO }) => hasScreen([...ALPHA, ...BRAVO])),
		).toBe(true);
	});

	test("never rolls a weapon with Splattercolor Screen when a player avoids it", () => {
		for (let i = 0; i < 50; i++) {
			const { ALPHA, BRAVO } = WeaponRoll.rollForSet("BALANCED", {
				noScreen: true,
			});

			for (const weaponId of [...ALPHA, ...BRAVO]) {
				expect(WeaponRoll.specialOf(weaponId)).not.toBe(
					SPLATTERCOLOR_SCREEN_ID,
				);
			}
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

describe("WeaponRoll.shapeKey", () => {
	test("is the team's frontline, midline and backline counts", () => {
		expect(
			WeaponRoll.shapeKey([
				SPLATTERSHOT,
				SPLAT_ROLLER,
				SPLATTERSHOT_PRO,
				SPLAT_CHARGER,
			]),
		).toBe("2-1-1");
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

	test("a team of stronger weapons is favoured", () => {
		const byStrength = R.sortBy(WeaponRoll.ROLLABLE_WEAPON_IDS, strengthById);

		expect(
			WeaponRoll.winProbability(
				byStrength.slice(-4),
				byStrength.slice(0, 4),
				null,
			),
		).toBeGreaterThan(0.5);
	});

	test("uses the mode's own weapon strengths", () => {
		const splatZonesEdge = (weaponId: MainWeaponId) =>
			(WeaponRoll.WEAPON_ROLL_DATA.weapons[weaponId].byMode.SZ?.strength ??
				strengthById(weaponId)) - strengthById(weaponId);
		const bySplatZonesEdge = R.sortBy(
			WeaponRoll.ROLLABLE_WEAPON_IDS,
			splatZonesEdge,
		);
		const betterInSplatZones = [bySplatZonesEdge.at(-1)!];
		const worseInSplatZones = [bySplatZonesEdge[0]];

		expect(
			WeaponRoll.winProbability(betterInSplatZones, worseInSplatZones, "SZ"),
		).toBeGreaterThan(
			WeaponRoll.winProbability(betterInSplatZones, worseInSplatZones, null),
		);
	});

	test("is symmetric between the sides", () => {
		expect(
			WeaponRoll.winProbability(alpha, bravo, null) +
				WeaponRoll.winProbability(bravo, alpha, null),
		).toBeCloseTo(1);
	});
});
