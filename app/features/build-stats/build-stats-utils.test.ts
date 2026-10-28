import { describe, expect, test } from "vitest";
import type {
	Ability,
	BuildAbilitiesTuple,
	MainWeaponId,
	ModeShort,
} from "~/modules/in-game-lists/types";
import { PEER_MIN_BUILDS_COUNT, PEERS_COUNT } from "./build-stats-constants";
import { abilityStats, popularBuilds } from "./build-stats-utils";

const SPLATTERSHOT: MainWeaponId = 40;
const SPLATTERSHOT_JR: MainWeaponId = 10;

const abilityPointCount = (
	weaponSplId: MainWeaponId,
	ability: Ability,
	abilityPoints: number,
	buildsCount: number,
) => ({ weaponSplId, ability, abilityPoints, buildsCount });

// 4 Splattershot builds: SSU 10 AP ×2, 20 AP ×1 and 1 without; LDE in 1
const SPLATTERSHOT_COUNTS = [
	abilityPointCount(SPLATTERSHOT, "SSU", 10, 2),
	abilityPointCount(SPLATTERSHOT, "SSU", 20, 1),
	abilityPointCount(SPLATTERSHOT, "LDE", 10, 1),
];

const ALL_ABILITY_POINT_SUMS = {
	abilities: [
		{ ability: "SSU" as const, abilityPointsSum: 50 },
		{ ability: "LDE" as const, abilityPointsSum: 20 },
	],
	buildsCount: 10,
};

const splattershotStats = (
	extra: {
		abilityPointCounts?: ReturnType<typeof abilityPointCount>[];
		buildCounts?: Array<{ weaponSplId: MainWeaponId; buildsCount: number }>;
	} = {},
) =>
	abilityStats({
		weaponId: SPLATTERSHOT,
		allAbilityPointSums: ALL_ABILITY_POINT_SUMS,
		weaponAbilityPointCounts: {
			abilityPointCounts: [
				...SPLATTERSHOT_COUNTS,
				...(extra.abilityPointCounts ?? []),
			],
			buildCounts: [
				{ weaponSplId: SPLATTERSHOT, buildsCount: 4 },
				...(extra.buildCounts ?? []),
			],
		},
	});

const stackable = (
	stats: ReturnType<typeof abilityStats>,
	ability: Ability,
) => {
	const result = stats.stackableAbilities.find((a) => a.name === ability);
	if (!result) throw new Error(`no stats for ${ability}`);
	return result;
};

describe("abilityStats", () => {
	test("counts the weapon's builds", () => {
		expect(splattershotStats().weaponBuildsCount).toBe(4);
	});

	test("averages a stackable ability's AP over every build, ones without it included", () => {
		expect(stackable(splattershotStats(), "SSU").apAverage).toEqual({
			weapon: 10,
			all: 5,
		});
	});

	test("sorts stackable abilities by the weapon's average AP", () => {
		expect(splattershotStats().stackableAbilities[0].name).toBe("SSU");
	});

	test("tells the share of builds running a stackable ability", () => {
		expect(stackable(splattershotStats(), "SSU").percentage).toBe(75);
	});

	test("buckets a stackable ability's AP, builds without it in the first bucket", () => {
		expect(
			stackable(splattershotStats(), "SSU").distribution.map(
				(bin) => bin.percentage,
			),
		).toEqual([25, 0, 0, 50, 25, 0]);
	});

	test("tells the share of builds running a main-only ability with its gear type", () => {
		const lastDitch = splattershotStats().mainOnlyAbilities.find(
			(ability) => ability.name === "LDE",
		);

		expect(lastDitch).toEqual({
			name: "LDE",
			gearType: "HEAD",
			percentage: { weapon: 25, all: 20 },
		});
	});

	test("compares to other weapons, the most invested first", () => {
		const stats = splattershotStats({
			abilityPointCounts: [abilityPointCount(SPLATTERSHOT_JR, "SSU", 30, 20)],
			buildCounts: [{ weaponSplId: SPLATTERSHOT_JR, buildsCount: 20 }],
		});

		expect(stackable(stats, "SSU").peers).toEqual([
			{ weaponSplId: SPLATTERSHOT_JR, apAverage: 30 },
			{ weaponSplId: SPLATTERSHOT, apAverage: 10 },
		]);
	});

	test("leaves weapons with few builds out of the comparison", () => {
		const stats = splattershotStats({
			buildCounts: [
				{
					weaponSplId: SPLATTERSHOT_JR,
					buildsCount: PEER_MIN_BUILDS_COUNT - 1,
				},
			],
		});

		expect(
			stackable(stats, "SSU").peers.map((peer) => peer.weaponSplId),
		).toEqual([SPLATTERSHOT]);
	});

	test("adds the weapon after the other weapons compared when it's not among the most invested", () => {
		const otherWeaponIds = [0, 10, 20, 30, 50, 60] as const;
		const stats = splattershotStats({
			abilityPointCounts: otherWeaponIds.map((weaponSplId) =>
				abilityPointCount(weaponSplId, "SSU", 30, 20),
			),
			buildCounts: otherWeaponIds.map((weaponSplId) => ({
				weaponSplId,
				buildsCount: 20,
			})),
		});

		const peers = stackable(stats, "SSU").peers;
		expect(peers).toHaveLength(PEERS_COUNT + 1);
		expect(peers.at(-1)?.weaponSplId).toBe(SPLATTERSHOT);
	});
});

const SSU_ABILITIES: BuildAbilitiesTuple = [
	["SSU", "SSU", "SSU", "SSU"],
	["SSU", "SSU", "SSU", "SSU"],
	["SSU", "SSU", "SSU", "SSU"],
];
const INK_SAVER_HEAD_ABILITIES: BuildAbilitiesTuple = [
	["SSU", "ISM", "ISM", "ISM"],
	["SSU", "SSU", "SSU", "SSU"],
	["SSU", "SSU", "SSU", "SSU"],
];
const INK_SAVER_CLOTHES_ABILITIES: BuildAbilitiesTuple = [
	["SSU", "SSU", "SSU", "SSU"],
	["SSU", "ISM", "ISM", "ISM"],
	["SSU", "SSU", "SSU", "SSU"],
];

const build = (
	abilitiesSignature: string,
	{
		abilities = SSU_ABILITIES,
		modes = null,
	}: { abilities?: BuildAbilitiesTuple; modes?: ModeShort[] | null } = {},
) => ({ abilitiesSignature, abilities, modes });

const repeat = <T>(count: number, item: () => T) =>
	Array.from({ length: count }, item);

describe("popularBuilds", () => {
	test("groups the builds by their ability points, the most popular first", () => {
		const result = popularBuilds([
			build("SSU_10,LDE_10"),
			...repeat(3, () => build("SSU_54,RSU_3")),
			build("SSU_10,LDE_10"),
		]);

		expect(
			result.builds.map(({ id, playersCount }) => [id, playersCount]),
		).toEqual([
			["SSU_54,RSU_3", 3],
			["SSU_10,LDE_10", 2],
		]);
	});

	test("leaves out builds with only one ability", () => {
		const result = popularBuilds([
			...repeat(3, () => build("SSU_57")),
			...repeat(2, () => build("SSU_47,LDE_10")),
		]);

		expect(result.builds.map((b) => b.id)).toEqual(["SSU_47,LDE_10"]);
		expect(result.playersCount).toBe(2);
	});

	test("leaves out ability combinations only one player runs", () => {
		const result = popularBuilds([
			build("SSU_54,RSU_3"),
			build("SSU_54,RSU_3"),
			build("SSU_47,LDE_10"),
		]);

		expect(result.builds.map((b) => b.id)).toEqual(["SSU_54,RSU_3"]);
	});

	test("gives builds with as many players the same rank", () => {
		const result = popularBuilds([
			...repeat(3, () => build("SSU_54,RSU_3")),
			...repeat(2, () => build("SSU_47,LDE_10")),
			...repeat(2, () => build("SSU_47,CB_10")),
			...repeat(2, () => build("SSU_47,OG_10")),
		]);

		expect(result.builds.map((b) => b.rank)).toEqual([1, 2, 2, 2]);
	});

	test("tells the share of players running a build", () => {
		const result = popularBuilds([
			build("SSU_54,RSU_3"),
			build("SSU_54,RSU_3"),
			build("SSU_47,LDE_10"),
			build("SSU_47,CB_10"),
		]);

		expect(result.builds[0].playersPercentage).toBe(50);
	});

	test("shows a build in its most common gear layout", () => {
		const result = popularBuilds([
			build("SSU_48,ISM_9", { abilities: INK_SAVER_HEAD_ABILITIES }),
			build("SSU_48,ISM_9", { abilities: INK_SAVER_CLOTHES_ABILITIES }),
			build("SSU_48,ISM_9", { abilities: INK_SAVER_CLOTHES_ABILITIES }),
		]);

		expect(result.builds[0].abilities).toEqual(INK_SAVER_CLOTHES_ABILITIES);
	});

	test("lists the modes more than half of a build's players play it in", () => {
		const result = popularBuilds([
			build("SSU_54,RSU_3", { modes: ["SZ", "TC"] }),
			build("SSU_54,RSU_3", { modes: ["SZ"] }),
			build("SSU_54,RSU_3", { modes: null }),
		]);

		expect(result.builds[0].modes).toEqual(["SZ"]);
	});

	test("parses the ability points of a build", () => {
		const result = popularBuilds([
			build("SSU_47,LDE_10"),
			build("SSU_47,LDE_10"),
		]);

		expect(result.builds[0].abilityPoints).toEqual([
			{ ability: "SSU", abilityPoints: 47 },
			{ ability: "LDE", abilityPoints: 10 },
		]);
	});

	test("counts how many popular builds run each ability", () => {
		const result = popularBuilds([
			...repeat(2, () => build("SSU_54,RSU_3")),
			...repeat(2, () => build("SSU_47,LDE_10")),
		]);

		expect(result.staples).toEqual([
			{ ability: "SSU", buildsCount: 2 },
			{ ability: "LDE", buildsCount: 1 },
			{ ability: "RSU", buildsCount: 1 },
		]);
	});

	test("tells how varied the builds are", () => {
		const result = popularBuilds([
			...repeat(3, () => build("SSU_54,RSU_3")),
			build("SSU_47,LDE_10"),
		]);

		expect(result).toMatchObject({
			playersCount: 4,
			uniqueBuildsCount: 2,
			topBuildsCount: 2,
			topBuildsPercentage: 100,
		});
	});

	test("counts builds only one player runs among the top builds", () => {
		const result = popularBuilds([
			...repeat(2, () => build("SSU_54,RSU_3")),
			...Array.from({ length: 18 }, (_, i) =>
				build(`SSU_${i + 1},LDE_${56 - i}`),
			),
		]);

		expect(result).toMatchObject({
			topBuildsCount: 10,
			topBuildsPercentage: 55,
		});
	});
});
