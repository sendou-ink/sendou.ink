import { describe, expect, test } from "vitest";
import {
	abilityPointCountsToAverages,
	popularBuilds,
} from "./build-stats-utils";

const commonAbilities = [
	{
		ability: "QR" as const,
		abilityPointsSum: 57,
	},
	{
		ability: "SJ" as const,
		abilityPointsSum: 10,
	},
	{
		ability: "CB" as const,
		abilityPointsSum: 10,
	},
	{
		ability: "T" as const,
		abilityPointsSum: 10,
	},
	{
		ability: "SS" as const,
		abilityPointsSum: 27,
	},
];

const allAbilities = [
	...commonAbilities,
	{ ability: "BRU" as const, abilityPointsSum: 57 },
];

describe("abilityPointCountsToAverages", () => {
	test("calculates build count", () => {
		const { weaponBuildsCount } = abilityPointCountsToAverages({
			allAbilities,
			weaponAbilities: commonAbilities,
		});

		expect(weaponBuildsCount).toBe(2);
	});

	test("calculates average ap (main only)", () => {
		const { mainOnlyAbilities } = abilityPointCountsToAverages({
			allAbilities,
			weaponAbilities: commonAbilities,
		});

		expect(
			mainOnlyAbilities.find((a) => a.name === "T")?.percentage.weapon,
		).toBe(50);
	});

	test("calculates average ap (stackable)", () => {
		const { stackableAbilities } = abilityPointCountsToAverages({
			allAbilities,
			weaponAbilities: commonAbilities,
		});

		expect(
			stackableAbilities.find((a) => a.name === "SS")?.apAverage.weapon,
		).toBe(13.5);
	});

	test("calculates average ap for all builds", () => {
		const { mainOnlyAbilities } = abilityPointCountsToAverages({
			allAbilities,
			weaponAbilities: commonAbilities,
		});

		expect(mainOnlyAbilities.find((a) => a.name === "T")?.percentage.all).toBe(
			33.33,
		);
	});
});

describe("popularBuilds", () => {
	test("calculates popular build", () => {
		const builds = popularBuilds([
			...new Array(10).fill(null).map(() => ({
				abilities: [{ ability: "QR" as const, abilityPoints: 57 }],
			})),
			{
				abilities: [{ ability: "BRU" as const, abilityPoints: 57 }],
			},
		]);

		expect(builds.length).toBe(1);
		expect(builds[0].count).toBe(10);
		expect(builds[0].abilities[0].ability).toBe("QR");
	});

	test("calculates second most popular build (sorted by count)", () => {
		const builds = popularBuilds([
			...new Array(10).fill(null).map(() => ({
				abilities: [{ ability: "QR" as const, abilityPoints: 57 }],
			})),
			...new Array(3).fill(null).map(() => ({
				abilities: [{ ability: "SS" as const, abilityPoints: 57 }],
			})),
			...new Array(5).fill(null).map(() => ({
				abilities: [{ ability: "SSU" as const, abilityPoints: 57 }],
			})),
		]);

		expect(builds.length).toBe(3);
		expect(builds[1].abilities[0].ability).toBe("SSU");
	});

	test("sums up abilities", () => {
		const builds = popularBuilds([
			{ abilities: [{ ability: "QR" as const, abilityPoints: 57 }] },
			{
				abilities: [
					{ ability: "QR" as const, abilityPoints: 10 },
					{ ability: "QR" as const, abilityPoints: 47 },
				],
			},
		]);

		expect(builds.length).toBe(1);
	});

	test("sorts abilities", () => {
		const builds = popularBuilds([
			{
				abilities: [
					{ ability: "QR" as const, abilityPoints: 10 },
					{ ability: "SS" as const, abilityPoints: 47 },
				],
			},
			{
				abilities: [
					{ ability: "QR" as const, abilityPoints: 10 },
					{ ability: "SS" as const, abilityPoints: 47 },
				],
			},
		]);

		expect(builds[0].abilities[1].ability).toBe("QR");
	});
});
