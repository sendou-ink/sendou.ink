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
	test("expands a single signature into ability rows", () => {
		const builds = popularBuilds([{ abilitiesSignature: "QR_57", count: 10 }]);

		expect(builds.length).toBe(1);
		expect(builds[0].count).toBe(10);
		expect(builds[0].abilities[0].ability).toBe("QR");
	});

	test("preserves the SQL-provided order across signatures", () => {
		const builds = popularBuilds([
			{ abilitiesSignature: "QR_57", count: 10 },
			{ abilitiesSignature: "SSU_57", count: 5 },
			{ abilitiesSignature: "SS_57", count: 3 },
		]);

		expect(builds.length).toBe(3);
		expect(builds[1].abilities[0].ability).toBe("SSU");
	});

	test("hides repeated count when consecutive rows share a count", () => {
		const builds = popularBuilds([
			{ abilitiesSignature: "QR_57", count: 4 },
			{ abilitiesSignature: "SSU_57", count: 4 },
		]);

		expect(builds[0].count).toBe(4);
		expect(builds[1].count).toBeNull();
	});

	test("preserves the order of abilities within a signature", () => {
		const builds = popularBuilds([
			{ abilitiesSignature: "SS_47,QR_10", count: 2 },
		]);

		expect(builds[0].abilities[0].ability).toBe("SS");
		expect(builds[0].abilities[1].ability).toBe("QR");
	});
});
