import { beforeEach, describe, expect, test } from "vitest";
import * as BuildFactory from "~/db/seed/factories/BuildFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as XRankPlacementFactory from "~/db/seed/factories/XRankPlacementFactory";
import { db } from "~/db/sql";
import { buildToAbilityPoints } from "~/features/build-analyzer/core/ability-points";
import type {
	BuildAbilitiesTuple,
	MainWeaponId,
} from "~/modules/in-game-lists/types";
import * as BuildRepository from "./BuildRepository.server";
import { BUILDS_PAGE_SIZE } from "./builds-constants";
import type { AbilityFilter } from "./builds-types";

const users = UserFactory.pool();

// Hero Shot Replica (45) is an alt skin folded to Splattershot (40) by the canonical id mapping
const SPLATTERSHOT: MainWeaponId = 40;
const HERO_SHOT_REPLICA: MainWeaponId = 45;
const SPLATTERSHOT_NOUVEAU: MainWeaponId = 41;

// Head ["ISM", "ISM", "ISS", "ISS"]: ISM main+sub = 13, ISS sub+sub = 6
// Clothes ["ISS", "ISM", "ISS", "ISM"]: ISS main+sub = 13, ISM sub+sub = 6
// Shoes ["ISM", "ISM", "ISM", "ISM"]: ISM main+3 subs = 19
// Totals: ISM = 38, ISS = 19 (MAIN_SLOT_AP=10, SUB_SLOT_AP=3)
const ABILITIES: BuildAbilitiesTuple = [
	["ISM", "ISM", "ISS", "ISS"],
	["ISS", "ISM", "ISS", "ISM"],
	["ISM", "ISM", "ISM", "ISM"],
];
const EXPECTED_SIGNATURE = "ISM_38,ISS_19";

const baseArgs = (
	overrides: Partial<Parameters<typeof BuildRepository.insert>[0]> = {},
): Parameters<typeof BuildRepository.insert>[0] => ({
	ownerId: users.id(1),
	title: "Test Build",
	description: null,
	modes: null,
	headGearSplId: null,
	clothesGearSplId: null,
	shoesGearSplId: null,
	weaponSplIds: [SPLATTERSHOT],
	abilities: ABILITIES,
	isPrivate: 0,
	...overrides,
});

/** A public Splattershot build with the shared abilities, for the read tests. */
const createBuild = (
	overrides: Partial<Parameters<typeof BuildFactory.create>[0]> & {
		ownerId: number;
	},
) =>
	BuildFactory.create({
		weaponSplIds: [SPLATTERSHOT],
		abilities: ABILITIES,
		...overrides,
	});

/** Puts the user in the top 500 with the given weapon, which builds sort by. */
const makeTop500 = (userId: number, weaponSplId: MainWeaponId) =>
	XRankPlacementFactory.create({ playerUserId: userId, weaponSplId, rank: 1 });

const buildById = (id: number) =>
	db
		.selectFrom("Build")
		.select(["abilitiesSignature", "isPrivate"])
		.where("id", "=", id)
		.executeTakeFirstOrThrow();

const buildWeaponsByBuildId = (buildId: number) =>
	db
		.selectFrom("BuildWeapon")
		.select(["weaponSplId", "canonicalWeaponSplId", "sortValue"])
		.where("buildId", "=", buildId)
		.orderBy("weaponSplId", "asc")
		.execute();

const buildAbilitySumsByBuildId = (buildId: number) =>
	db
		.selectFrom("BuildAbilitySum")
		.select(["ability", "abilityPoints"])
		.where("buildId", "=", buildId)
		.execute();

const buildWeaponAbilitiesByBuildId = (buildId: number) =>
	db
		.selectFrom("BuildWeaponAbility")
		.select(["canonicalWeaponSplId", "ability", "abilityPoints"])
		.where("buildId", "=", buildId)
		.execute();

// ISM 18 (subs doubled), ISS 20, SS 18
const DOUBLER_ABILITIES: BuildAbilitiesTuple = [
	["AD", "ISM", "ISM", "ISM"],
	["ISS", "SS", "SS", "SS"],
	["ISS", "SS", "SS", "SS"],
];
const LDE_ABILITIES: BuildAbilitiesTuple = [
	["LDE", "SS", "SS", "SS"],
	["SS", "SS", "SS", "SS"],
	["SS", "SS", "SS", "SS"],
];

const ABILITY_FILTER_BUILDS = {
	inkSaver: ABILITIES,
	doubler: DOUBLER_ABILITIES,
	lastDitch: LDE_ABILITIES,
} satisfies Record<string, BuildAbilitiesTuple>;

type AbilityFilterBuild = keyof typeof ABILITY_FILTER_BUILDS;

const ABILITY_FILTER_CASES: Array<{
	why: string;
	filters: AbilityFilter[];
	expected: AbilityFilterBuild[];
}> = [
	{
		why: "has an ability in any slot",
		filters: [{ type: "HAS", ability: "ISS" }],
		expected: ["inkSaver", "doubler"],
	},
	{
		why: "has a main-only ability",
		filters: [{ type: "HAS", ability: "LDE" }],
		expected: ["lastDitch"],
	},
	{
		why: "doesn't have an ability",
		filters: [{ type: "HAS_NOT", ability: "LDE" }],
		expected: ["inkSaver", "doubler"],
	},
	{
		why: "has at least the AP, doubled subs included",
		filters: [{ type: "AT_LEAST", ability: "ISM", ap: 18 }],
		expected: ["inkSaver", "doubler"],
	},
	{
		why: "has more AP than at least asks",
		filters: [{ type: "AT_LEAST", ability: "ISM", ap: 19 }],
		expected: ["inkSaver"],
	},
	{
		why: "has at most the AP, lacking the ability included",
		filters: [{ type: "AT_MOST", ability: "ISS", ap: 19 }],
		expected: ["inkSaver", "lastDitch"],
	},
	{
		why: "matches every filter",
		filters: [
			{ type: "HAS", ability: "ISS" },
			{ type: "AT_MOST", ability: "ISM", ap: 20 },
		],
		expected: ["doubler"],
	},
];

/** Creates one build per {@link ABILITY_FILTER_BUILDS} and returns the ids the expected names map to. */
const createAbilityFilterBuilds = async (expected: AbilityFilterBuild[]) => {
	const idsByName = new Map<AbilityFilterBuild, number>();
	for (const [name, abilities] of Object.entries(ABILITY_FILTER_BUILDS)) {
		const build = await createBuild({ ownerId: users.id(1), abilities });
		idsByName.set(name as AbilityFilterBuild, build.id);
	}

	return expected.map((name) => idsByName.get(name)!).sort((a, b) => a - b);
};

const NO_FILTERS: BuildRepository.BuildListFilters = {
	abilities: [],
	mode: null,
	date: null,
};

const weaponBuilds = (
	weaponId: MainWeaponId,
	args: Partial<
		Omit<Parameters<typeof BuildRepository.findPageByWeaponId>[0], "weaponId">
	> = {},
) =>
	BuildRepository.findPageByWeaponId({
		weaponId,
		filters: NO_FILTERS,
		page: 1,
		sortAbilities: false,
		...args,
	});

const userBuilds = ({
	filters,
	sorting,
	...args
}: Partial<
	Omit<Parameters<typeof BuildRepository.findPageByUserId>[0], "filters">
> & {
	filters?: Partial<
		Parameters<typeof BuildRepository.findPageByUserId>[0]["filters"]
	>;
} = {}) =>
	BuildRepository.findPageByUserId({
		userId: users.id(1),
		showPrivate: true,
		filters: { ...NO_FILTERS, weaponId: null, visibility: null, ...filters },
		sorting: sorting ?? { buildSorting: ["UPDATED_AT"], weaponPool: [] },
		page: 1,
		sortAbilities: false,
		...args,
	});

const idsOf = (result: { builds: Array<{ id: number }> }) =>
	result.builds.map((build) => build.id);

describe("BuildRepository.insert — computeBuildData", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	describe("abilitiesSignature & ability sums", () => {
		test("writes the serialized abilitiesSignature sorted by AP desc", async () => {
			const { id } = await BuildRepository.insert(baseArgs());

			const build = await buildById(id);
			expect(build.abilitiesSignature).toBe(EXPECTED_SIGNATURE);
		});

		test("inserts one BuildAbilitySum row per distinct ability with summed AP", async () => {
			const { id } = await BuildRepository.insert(baseArgs());

			const sums = await buildAbilitySumsByBuildId(id);

			expect(sums).toHaveLength(2);
			expect(sums).toContainEqual({ ability: "ISM", abilityPoints: 38 });
			expect(sums).toContainEqual({ ability: "ISS", abilityPoints: 19 });
		});

		test("agrees with the analyzer's AP calculation for Ability Doubler builds", async () => {
			const abilitiesWithDoubler: BuildAbilitiesTuple = [
				["ISM", "ISM", "ISM", "ISM"],
				["AD", "ISM", "ISM", "ISM"],
				["SJ", "ISM", "ISM", "ISM"],
			];
			const { id } = await BuildRepository.insert(
				baseArgs({ abilities: abilitiesWithDoubler }),
			);

			const sums = await buildAbilitySumsByBuildId(id);
			const analyzerIsmAp =
				buildToAbilityPoints(abilitiesWithDoubler).get("ISM");

			expect(sums).toContainEqual({
				ability: "ISM",
				abilityPoints: analyzerIsmAp,
			});
		});

		test("does not insert BuildAbilitySum rows for private builds", async () => {
			const { id } = await BuildRepository.insert(baseArgs({ isPrivate: 1 }));

			const sums = await buildAbilitySumsByBuildId(id);
			expect(sums).toHaveLength(0);
		});

		test("still writes abilitiesSignature for private builds", async () => {
			const { id } = await BuildRepository.insert(baseArgs({ isPrivate: 1 }));

			const build = await buildById(id);
			expect(build.abilitiesSignature).toBe(EXPECTED_SIGNATURE);
		});
	});

	describe("BuildWeaponAbility rows", () => {
		test("inserts one row per weapon × ability for public builds", async () => {
			const { id } = await BuildRepository.insert(
				baseArgs({ weaponSplIds: [SPLATTERSHOT, SPLATTERSHOT_NOUVEAU] }),
			);

			const rows = await buildWeaponAbilitiesByBuildId(id);
			expect(rows).toHaveLength(4);
			expect(rows).toContainEqual({
				canonicalWeaponSplId: SPLATTERSHOT,
				ability: "ISM",
				abilityPoints: 38,
			});
			expect(rows).toContainEqual({
				canonicalWeaponSplId: SPLATTERSHOT_NOUVEAU,
				ability: "ISS",
				abilityPoints: 19,
			});
		});

		test("folds alt skins to their canonical weapon id", async () => {
			const { id } = await BuildRepository.insert(
				baseArgs({ weaponSplIds: [HERO_SHOT_REPLICA] }),
			);

			const rows = await buildWeaponAbilitiesByBuildId(id);
			const weaponIds = new Set(rows.map((r) => r.canonicalWeaponSplId));
			expect(weaponIds).toEqual(new Set([SPLATTERSHOT]));
		});

		test("does not insert any rows for private builds", async () => {
			const { id } = await BuildRepository.insert(baseArgs({ isPrivate: 1 }));

			const rows = await buildWeaponAbilitiesByBuildId(id);
			expect(rows).toHaveLength(0);
		});
	});

	describe("BuildWeapon.canonicalWeaponSplId", () => {
		test("stores the canonical id alongside the original weaponSplId", async () => {
			const { id } = await BuildRepository.insert(
				baseArgs({ weaponSplIds: [HERO_SHOT_REPLICA] }),
			);

			const weapons = await buildWeaponsByBuildId(id);
			expect(weapons).toHaveLength(1);
			expect(weapons[0].weaponSplId).toBe(HERO_SHOT_REPLICA);
			expect(weapons[0].canonicalWeaponSplId).toBe(SPLATTERSHOT);
		});
	});

	describe("sortValue", () => {
		test("defaults to tier 4 (sortValue = 9) when owner has no PlusTier", async () => {
			const { id } = await BuildRepository.insert(baseArgs());

			const [weapon] = await buildWeaponsByBuildId(id);
			expect(weapon.sortValue).toBe(9);
		});

		test("uses owner's PlusTier (tier 2 → sortValue = 5)", async () => {
			const plusOwner = await UserFactory.create(null, { plusTier: 2 });

			const { id } = await BuildRepository.insert(
				baseArgs({ ownerId: plusOwner.id }),
			);

			const [weapon] = await buildWeaponsByBuildId(id);
			expect(weapon.sortValue).toBe(5);
		});

		test("is null for private builds regardless of tier", async () => {
			const plusOwner = await UserFactory.create(null, { plusTier: 1 });

			const { id } = await BuildRepository.insert(
				baseArgs({ ownerId: plusOwner.id, isPrivate: 1 }),
			);

			const [weapon] = await buildWeaponsByBuildId(id);
			expect(weapon.sortValue).toBeNull();
		});

		test("subtracts 1 when the weapon is top500 for the owner", async () => {
			await makeTop500(users.id(1), SPLATTERSHOT);

			const { id } = await BuildRepository.insert(
				baseArgs({ weaponSplIds: [SPLATTERSHOT, SPLATTERSHOT_NOUVEAU] }),
			);

			const weapons = await buildWeaponsByBuildId(id);
			const splattershot = weapons.find((w) => w.weaponSplId === SPLATTERSHOT);
			const nouveau = weapons.find(
				(w) => w.weaponSplId === SPLATTERSHOT_NOUVEAU,
			);

			expect(splattershot?.sortValue).toBe(8);
			expect(nouveau?.sortValue).toBe(9);
		});

		test("combines top500 with the owner's PlusTier", async () => {
			const plusOwner = await UserFactory.create(null, { plusTier: 1 });
			await makeTop500(plusOwner.id, SPLATTERSHOT);

			const { id } = await BuildRepository.insert(
				baseArgs({ ownerId: plusOwner.id }),
			);

			const [weapon] = await buildWeaponsByBuildId(id);
			expect(weapon.sortValue).toBe(2);
		});
	});

	test("findPageByWeaponId.weapons[].isTop500 matches the sortValue formula", async () => {
		await makeTop500(users.id(1), SPLATTERSHOT);

		await createBuild({
			ownerId: users.id(1),
			weaponSplIds: [SPLATTERSHOT, SPLATTERSHOT_NOUVEAU],
		});

		const {
			builds: [build],
		} = await weaponBuilds(SPLATTERSHOT);

		const splattershot = build.weapons.find(
			(w) => w.weaponSplId === SPLATTERSHOT,
		);
		const nouveau = build.weapons.find(
			(w) => w.weaponSplId === SPLATTERSHOT_NOUVEAU,
		);

		expect(splattershot?.isTop500).toBe(1);
		expect(nouveau?.isTop500).toBe(0);
	});

	test("a multi-weapon build is returned by findPageByWeaponId for each of its weapons", async () => {
		await createBuild({
			ownerId: users.id(1),
			title: "Multi-weapon Build",
			weaponSplIds: [SPLATTERSHOT, SPLATTERSHOT_NOUVEAU],
		});

		const { builds: splattershotBuilds } = await weaponBuilds(SPLATTERSHOT);
		const { builds: nouveauBuilds } = await weaponBuilds(SPLATTERSHOT_NOUVEAU);

		expect(splattershotBuilds).toHaveLength(1);
		expect(splattershotBuilds[0].title).toBe("Multi-weapon Build");
		expect(nouveauBuilds).toHaveLength(1);
		expect(nouveauBuilds[0].id).toBe(splattershotBuilds[0].id);
	});
});

// All SS: each gear sums to 10 (main) + 3*3 (subs) = 19, total 57.
const SS_ABILITIES: BuildAbilitiesTuple = [
	["SS", "SS", "SS", "SS"],
	["SS", "SS", "SS", "SS"],
	["SS", "SS", "SS", "SS"],
];

describe("BuildRepository.findNewestBuildPerOwnerByWeaponId", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	const newestBuilds = (
		weaponId: MainWeaponId,
		updatedSince: string | null = null,
	) =>
		BuildRepository.findNewestBuildPerOwnerByWeaponId({
			weaponId,
			updatedSince,
		});

	test("returns only each owner's newest build", async () => {
		const olderBuild = await createBuild({ ownerId: users.id(1) });
		await BuildFactory.backdate(olderBuild.id, new Date("2024-01-01"));
		await createBuild({ ownerId: users.id(1), abilities: SS_ABILITIES });

		const builds = await newestBuilds(SPLATTERSHOT);

		expect(builds.map((build) => build.abilitiesSignature)).toEqual(["SS_57"]);
	});

	test("only returns public builds", async () => {
		await createBuild({ ownerId: users.id(1) });
		await createBuild({ ownerId: users.id(2), isPrivate: 1 });

		expect(await newestBuilds(SPLATTERSHOT)).toHaveLength(1);
	});

	test("folds alt skins via canonicalWeaponSplId", async () => {
		await createBuild({ ownerId: users.id(1) });
		await createBuild({
			ownerId: users.id(2),
			weaponSplIds: [HERO_SHOT_REPLICA],
		});

		expect(await newestBuilds(SPLATTERSHOT)).toHaveLength(2);
		expect(await newestBuilds(HERO_SHOT_REPLICA)).toHaveLength(2);
	});

	test("leaves out owners whose newest build was updated before the date", async () => {
		const oldBuild = await createBuild({ ownerId: users.id(1) });
		await BuildFactory.backdate(oldBuild.id, new Date("2024-01-01"));
		await createBuild({ ownerId: users.id(2) });

		expect(await newestBuilds(SPLATTERSHOT, "2025-01-01")).toHaveLength(1);
	});
});

describe("BuildRepository.findAbilityPointCountsByWeaponIds", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	const abilityPointCounts = (updatedSince: string | null = null) =>
		BuildRepository.findAbilityPointCountsByWeaponIds({
			weaponIds: [SPLATTERSHOT, SPLATTERSHOT_NOUVEAU],
			updatedSince,
		});

	test("counts the builds running each amount of AP of each ability per weapon", async () => {
		await createBuild({ ownerId: users.id(1) });
		await createBuild({ ownerId: users.id(2) });
		await createBuild({
			ownerId: users.id(2),
			weaponSplIds: [HERO_SHOT_REPLICA, SPLATTERSHOT_NOUVEAU],
			abilities: SS_ABILITIES,
		});

		const { abilityPointCounts: counts, buildCounts } =
			await abilityPointCounts();

		expect(counts).toEqual(
			expect.arrayContaining([
				{
					weaponSplId: SPLATTERSHOT,
					ability: "ISM",
					abilityPoints: 38,
					buildsCount: 2,
				},
				{
					weaponSplId: SPLATTERSHOT,
					ability: "SS",
					abilityPoints: 57,
					buildsCount: 1,
				},
				{
					weaponSplId: SPLATTERSHOT_NOUVEAU,
					ability: "SS",
					abilityPoints: 57,
					buildsCount: 1,
				},
			]),
		);
		expect(buildCounts).toEqual(
			expect.arrayContaining([
				{ weaponSplId: SPLATTERSHOT, buildsCount: 3 },
				{ weaponSplId: SPLATTERSHOT_NOUVEAU, buildsCount: 1 },
			]),
		);
	});

	test("only counts builds updated after the date", async () => {
		const oldBuild = await createBuild({ ownerId: users.id(1) });
		await BuildFactory.backdate(oldBuild.id, new Date("2024-01-01"));
		await createBuild({ ownerId: users.id(2) });

		const { buildCounts } = await abilityPointCounts("2025-01-01");

		expect(buildCounts).toEqual([
			{ weaponSplId: SPLATTERSHOT, buildsCount: 1 },
		]);
	});
});

describe("BuildRepository.findAllAbilityPointSums", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	const abilityPointSums = (updatedSince: string | null = null) =>
		BuildRepository.findAllAbilityPointSums(updatedSince);

	test("sums the AP of every public build, a multi-weapon build counted once", async () => {
		await createBuild({
			ownerId: users.id(1),
			weaponSplIds: [SPLATTERSHOT, SPLATTERSHOT_NOUVEAU],
		});
		await createBuild({ ownerId: users.id(2) });
		await createBuild({ ownerId: users.id(2), isPrivate: 1 });

		const sums = await abilityPointSums();

		expect(sums.buildsCount).toBe(2);
		expect(sums.abilities).toEqual(
			expect.arrayContaining([
				{ ability: "ISM", abilityPointsSum: 76 },
				{ ability: "ISS", abilityPointsSum: 38 },
			]),
		);
	});

	test("only sums builds updated after the date", async () => {
		const oldBuild = await createBuild({ ownerId: users.id(1) });
		await BuildFactory.backdate(oldBuild.id, new Date("2024-01-01"));
		await createBuild({ ownerId: users.id(2) });

		expect((await abilityPointSums("2025-01-01")).buildsCount).toBe(1);
	});
});

describe("BuildRepository.countAllPublicByWeaponId", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("counts public builds per weapon with alt skins folded", async () => {
		await createBuild({ ownerId: users.id(1) });
		await createBuild({
			ownerId: users.id(2),
			weaponSplIds: [HERO_SHOT_REPLICA, SPLATTERSHOT_NOUVEAU],
		});

		const counts = await BuildRepository.countAllPublicByWeaponId();

		expect(counts.get(SPLATTERSHOT)).toBe(2);
		expect(counts.get(SPLATTERSHOT_NOUVEAU)).toBe(1);
		expect(counts.has(HERO_SHOT_REPLICA)).toBe(false);
	});

	test("excludes private builds", async () => {
		await createBuild({ ownerId: users.id(1) });
		await createBuild({ ownerId: users.id(2), isPrivate: 1 });

		const counts = await BuildRepository.countAllPublicByWeaponId();

		expect(counts.get(SPLATTERSHOT)).toBe(1);
	});
});

describe("BuildRepository.findPageByWeaponId", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("pages by author with all of their builds, counting the authors", async () => {
		await users.create(BUILDS_PAGE_SIZE + 1);
		for (const ownerId of users.ids()) {
			await BuildFactory.createMany(2, {
				ownerId,
				weaponSplIds: [SPLATTERSHOT],
			});
		}

		const firstPage = await weaponBuilds(SPLATTERSHOT, { page: 1 });
		const secondPage = await weaponBuilds(SPLATTERSHOT, { page: 2 });

		expect(firstPage.builds).toHaveLength(BUILDS_PAGE_SIZE * 2);
		expect(firstPage.ownerCount).toBe(BUILDS_PAGE_SIZE + 1);
		expect(secondPage.builds).toHaveLength(2);
	});

	test("keeps an author's builds together, after their newest", async () => {
		const oldest = await createBuild({ ownerId: users.id(1) });
		await BuildFactory.backdate(oldest.id, new Date("2024-01-01"));
		const older = await createBuild({ ownerId: users.id(2) });
		await BuildFactory.backdate(older.id, new Date("2025-01-01"));
		const newest = await createBuild({ ownerId: users.id(1) });

		const result = await weaponBuilds(SPLATTERSHOT);

		expect(idsOf(result)).toEqual([newest.id, oldest.id, older.id]);
	});

	test("ranks authors by their best ranked build", async () => {
		await makeTop500(users.id(2), SPLATTERSHOT);
		const older = await createBuild({ ownerId: users.id(2) });
		await BuildFactory.backdate(older.id, new Date("2025-01-01"));
		const newest = await createBuild({ ownerId: users.id(1) });

		const result = await weaponBuilds(SPLATTERSHOT);

		expect(idsOf(result)).toEqual([older.id, newest.id]);
	});

	test("excludes private builds", async () => {
		await createBuild({ ownerId: users.id(1) });
		await createBuild({ ownerId: users.id(2), isPrivate: 1 });

		const result = await weaponBuilds(SPLATTERSHOT);

		expect(result.builds).toHaveLength(1);
	});

	test.each(ABILITY_FILTER_CASES)(
		"filters by abilities: $why",
		async ({ filters, expected }) => {
			const expectedIds = await createAbilityFilterBuilds(expected);

			const result = await weaponBuilds(SPLATTERSHOT, {
				filters: { ...NO_FILTERS, abilities: filters },
			});

			expect(idsOf(result).sort((a, b) => a - b)).toEqual(expectedIds);
		},
	);

	test("filters by mode", async () => {
		const towerControl = await createBuild({
			ownerId: users.id(1),
			modes: ["SZ", "TC"],
		});
		await createBuild({ ownerId: users.id(1), modes: ["SZ"] });
		await createBuild({ ownerId: users.id(2), modes: null });

		const result = await weaponBuilds(SPLATTERSHOT, {
			filters: { ...NO_FILTERS, mode: "TC" },
		});

		expect(idsOf(result)).toEqual([towerControl.id]);
		expect(result.ownerCount).toBe(1);
	});

	test("counts the matching builds only when filtering", async () => {
		await createBuild({ ownerId: users.id(1), modes: ["TC"] });
		await createBuild({ ownerId: users.id(1), modes: ["TC"] });
		await createBuild({ ownerId: users.id(2), modes: ["SZ"] });

		const filtered = await weaponBuilds(SPLATTERSHOT, {
			filters: { ...NO_FILTERS, mode: "TC" },
		});
		const unfiltered = await weaponBuilds(SPLATTERSHOT);

		expect(filtered.buildCount).toBe(2);
		expect(unfiltered.buildCount).toBeNull();
	});

	test("filters by the date the build was last updated after", async () => {
		const recent = await createBuild({ ownerId: users.id(1) });
		const old = await createBuild({ ownerId: users.id(2) });
		await BuildFactory.backdate(old.id, new Date("2025-01-01"));

		const result = await weaponBuilds(SPLATTERSHOT, {
			filters: { ...NO_FILTERS, date: "2026-01-28" },
		});

		expect(idsOf(result)).toEqual([recent.id]);
	});
});

describe("BuildRepository.findPageByUserId", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("hides private builds unless asked to show them", async () => {
		const publicBuild = await createBuild({ ownerId: users.id(1) });
		await createBuild({ ownerId: users.id(1), isPrivate: 1 });

		const result = await userBuilds({ showPrivate: false });

		expect(idsOf(result)).toEqual([publicBuild.id]);
	});

	test("filters private builds by their abilities too", async () => {
		const privateBuild = await createBuild({
			ownerId: users.id(1),
			isPrivate: 1,
		});
		await createBuild({
			ownerId: users.id(1),
			isPrivate: 1,
			abilities: [
				["SS", "SS", "SS", "SS"],
				["SS", "SS", "SS", "SS"],
				["SS", "SS", "SS", "SS"],
			],
		});

		const result = await userBuilds({
			filters: {
				abilities: [
					{ type: "HAS", ability: "ISS" },
					{ type: "AT_LEAST", ability: "ISM", ap: 38 },
				],
			},
		});

		expect(idsOf(result)).toEqual([privateBuild.id]);
	});

	test.each(ABILITY_FILTER_CASES)(
		"filters by abilities: $why",
		async ({ filters, expected }) => {
			const expectedIds = await createAbilityFilterBuilds(expected);

			const result = await userBuilds({ filters: { abilities: filters } });

			expect(idsOf(result).sort((a, b) => a - b)).toEqual(expectedIds);
		},
	);

	test("filters by exact weapon id", async () => {
		const nouveauBuild = await createBuild({
			ownerId: users.id(1),
			weaponSplIds: [SPLATTERSHOT_NOUVEAU, SPLATTERSHOT],
		});
		await createBuild({ ownerId: users.id(1) });

		const result = await userBuilds({
			filters: { weaponId: SPLATTERSHOT_NOUVEAU },
		});

		expect(idsOf(result)).toEqual([nouveauBuild.id]);
	});

	test("filters by visibility", async () => {
		await createBuild({ ownerId: users.id(1) });
		const privateBuild = await createBuild({
			ownerId: users.id(1),
			isPrivate: 1,
		});

		const result = await userBuilds({ filters: { visibility: "PRIVATE" } });

		expect(idsOf(result)).toEqual([privateBuild.id]);
	});

	test("returns a page of builds and the total count", async () => {
		await BuildFactory.createMany(BUILDS_PAGE_SIZE + 1, {
			ownerId: users.id(1),
		});

		const secondPage = await userBuilds({ page: 2 });

		expect(secondPage.builds).toHaveLength(1);
		expect(secondPage.totalCount).toBe(BUILDS_PAGE_SIZE + 1);
	});

	test("grants the owner edit permission", async () => {
		await createBuild({ ownerId: users.id(1) });

		const {
			builds: [build],
		} = await userBuilds();

		expect(build.permissions.EDIT).toEqual([users.id(1)]);
	});

	describe("sorting", () => {
		const sortedTitles = async (
			sorting: Parameters<
				typeof BuildRepository.findPageByUserId
			>[0]["sorting"],
		) => (await userBuilds({ sorting })).builds.map((build) => build.title);

		const createTitled = (
			title: string,
			overrides: Partial<Parameters<typeof BuildFactory.create>[0]> = {},
		) => createBuild({ ownerId: users.id(1), title, ...overrides });

		test("sorts by UPDATED_AT, newest first", async () => {
			const oldest = await createTitled("Oldest");
			await createTitled("Newest");
			await BuildFactory.backdate(oldest.id, new Date("2025-01-01"));

			expect(
				await sortedTitles({ buildSorting: ["UPDATED_AT"], weaponPool: [] }),
			).toEqual(["Newest", "Oldest"]);
		});

		test("sorts by ALPHABETICAL_TITLE ignoring case", async () => {
			await createTitled("beta");
			await createTitled("Gamma");
			await createTitled("Alpha");

			expect(
				await sortedTitles({
					buildSorting: ["ALPHABETICAL_TITLE"],
					weaponPool: [],
				}),
			).toEqual(["Alpha", "beta", "Gamma"]);
		});

		test("sorts by WEAPON_POOL, kits of a pool weapon counting as it and builds without pool weapons last", async () => {
			await createTitled("Not in pool", { weaponSplIds: [1000] });
			await createTitled("Second", { weaponSplIds: [10] });
			await createTitled("First kit", { weaponSplIds: [SPLATTERSHOT_NOUVEAU] });

			expect(
				await sortedTitles({
					buildSorting: ["WEAPON_POOL"],
					weaponPool: [HERO_SHOT_REPLICA, 10],
				}),
			).toEqual(["First kit", "Second", "Not in pool"]);
		});

		test("sorts by WEAPON_IN_GAME_ORDER using the build's lowest weapon id", async () => {
			await createTitled("Last", { weaponSplIds: [1000] });
			await createTitled("First", { weaponSplIds: [2000, 0] });
			await createTitled("Middle", { weaponSplIds: [10] });

			expect(
				await sortedTitles({
					buildSorting: ["WEAPON_IN_GAME_ORDER"],
					weaponPool: [],
				}),
			).toEqual(["First", "Middle", "Last"]);
		});

		test("sorts by MODE in mode order, builds without modes last", async () => {
			await createTitled("No modes", { modes: null });
			await createTitled("Clam Blitz", { modes: ["CB"] });
			await createTitled("Splat Zones", { modes: ["CB", "SZ"] });

			expect(
				await sortedTitles({ buildSorting: ["MODE"], weaponPool: [] }),
			).toEqual(["Splat Zones", "Clam Blitz", "No modes"]);
		});

		test("sorts by TOP_500", async () => {
			await makeTop500(users.id(1), SPLATTERSHOT_NOUVEAU);
			await createTitled("Not top 500");
			await createTitled("Top 500", {
				weaponSplIds: [SPLATTERSHOT, SPLATTERSHOT_NOUVEAU],
			});

			expect(
				await sortedTitles({ buildSorting: ["TOP_500"], weaponPool: [] }),
			).toEqual(["Top 500", "Not top 500"]);
		});

		test("sorts by HEADGEAR_ID, builds without one last", async () => {
			await createTitled("No headgear", { headGearSplId: null });
			await createTitled("Second", { headGearSplId: 2000 });
			await createTitled("First", { headGearSplId: 1000 });

			expect(
				await sortedTitles({ buildSorting: ["HEADGEAR_ID"], weaponPool: [] }),
			).toEqual(["First", "Second", "No headgear"]);
		});

		test.each([
			{ sort: "PUBLIC_BUILD" as const, expected: ["Public", "Private"] },
			{ sort: "PRIVATE_BUILD" as const, expected: ["Private", "Public"] },
		])("sorts by $sort", async ({ sort, expected }) => {
			await createTitled("Private", { isPrivate: 1 });
			await createTitled("Public");

			expect(
				await sortedTitles({ buildSorting: [sort], weaponPool: [] }),
			).toEqual(expected);
		});

		test("breaks ties with the next sort", async () => {
			const olderB = await createTitled("B");
			await createTitled("A");
			await createTitled("B");
			await BuildFactory.backdate(olderB.id, new Date("2025-01-01"));

			const result = await userBuilds({
				sorting: {
					buildSorting: ["ALPHABETICAL_TITLE", "UPDATED_AT"],
					weaponPool: [],
				},
			});

			expect(result.builds.map((build) => build.title)).toEqual([
				"A",
				"B",
				"B",
			]);
			expect(result.builds[2].id).toBe(olderB.id);
		});

		test("sorts by weapon pool, then newest first, when the user hasn't chosen", async () => {
			const olderInPool = await createTitled("Older in pool");
			await createTitled("Not in pool", { weaponSplIds: [1000] });
			await createTitled("Newer in pool");
			await BuildFactory.backdate(olderInPool.id, new Date("2025-01-01"));

			expect(
				await sortedTitles({ buildSorting: null, weaponPool: [SPLATTERSHOT] }),
			).toEqual(["Newer in pool", "Older in pool", "Not in pool"]);
		});
	});
});

describe("BuildRepository.countsByUserId", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("counts the builds, private ones and builds per exact weapon id", async () => {
		await createBuild({
			ownerId: users.id(1),
			weaponSplIds: [SPLATTERSHOT, SPLATTERSHOT_NOUVEAU],
		});
		await createBuild({
			ownerId: users.id(1),
			weaponSplIds: [HERO_SHOT_REPLICA],
			isPrivate: 1,
		});

		const counts = await BuildRepository.countsByUserId(users.id(1), {
			showPrivate: true,
		});

		expect(counts).toEqual({
			total: 2,
			private: 1,
			byWeaponId: {
				[SPLATTERSHOT]: 1,
				[SPLATTERSHOT_NOUVEAU]: 1,
				[HERO_SHOT_REPLICA]: 1,
			},
		});
	});

	test("leaves private builds out unless asked to show them", async () => {
		await createBuild({ ownerId: users.id(1) });
		await createBuild({ ownerId: users.id(1), isPrivate: 1 });

		const counts = await BuildRepository.countsByUserId(users.id(1), {
			showPrivate: false,
		});

		expect(counts).toEqual({
			total: 1,
			private: 0,
			byWeaponId: { [SPLATTERSHOT]: 1 },
		});
	});
});
