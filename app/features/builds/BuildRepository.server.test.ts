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
import { withNoUser, withUserId } from "~/utils/Test";
import * as BuildRepository from "./BuildRepository.server";
import { sortAbilities } from "./core/ability-sorting.server";

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
});

describe("BuildRepository.builds", () => {
	const ownerId = () => users.id(1);
	const otherUserId = () => users.id(2);

	beforeEach(async () => {
		await users.create(2);
	});

	const titlesOf = (rows: Array<{ title: string }>) =>
		rows.map((row) => row.title).sort((a, b) => a.localeCompare(b));

	describe("private guard", () => {
		beforeEach(async () => {
			await createBuild({ ownerId: ownerId(), title: "public" });
			await createBuild({ ownerId: ownerId(), title: "private", isPrivate: 1 });
		});

		test("hides private builds by default", async () => {
			const rows = await BuildRepository.builds()
				.where({ ownerId: ownerId() })
				.execute();

			expect(titlesOf(rows)).toEqual(["public"]);
		});

		test("visibleToActor shows the actor their own private builds", async () => {
			const rows = await withUserId(ownerId(), () =>
				BuildRepository.builds()
					.where({ ownerId: ownerId() })
					.visibleToActor()
					.execute(),
			);

			expect(titlesOf(rows)).toEqual(["private", "public"]);
		});

		test("visibleToActor hides another user's private builds", async () => {
			const rows = await withUserId(otherUserId(), () =>
				BuildRepository.builds()
					.where({ ownerId: ownerId() })
					.visibleToActor()
					.execute(),
			);

			expect(titlesOf(rows)).toEqual(["public"]);
		});

		test("visibleToActor shows anonymous visitors public builds only", async () => {
			const rows = await withNoUser(() =>
				BuildRepository.builds()
					.where({ ownerId: ownerId() })
					.visibleToActor()
					.execute(),
			);

			expect(titlesOf(rows)).toEqual(["public"]);
		});

		test("ownedByActor returns only the actor's builds, private included", async () => {
			await createBuild({ ownerId: otherUserId(), title: "other" });

			const rows = await withUserId(ownerId(), () =>
				BuildRepository.builds().ownedByActor().execute(),
			);

			expect(titlesOf(rows)).toEqual(["private", "public"]);
		});
	});

	test("forWeapon marks a weapon isTop500 by the sortValue formula", async () => {
		await makeTop500(ownerId(), SPLATTERSHOT);
		await createBuild({
			ownerId: ownerId(),
			weaponSplIds: [SPLATTERSHOT, SPLATTERSHOT_NOUVEAU],
		});

		const [build] = await BuildRepository.builds()
			.forWeapon(SPLATTERSHOT)
			.execute();

		expect(build.weapons).toEqual([
			{ weaponSplId: SPLATTERSHOT, isTop500: true },
			{ weaponSplId: SPLATTERSHOT_NOUVEAU, isTop500: false },
		]);
	});

	test("forWeapon returns a multi-weapon build for each of its weapons", async () => {
		const { id } = await createBuild({
			ownerId: ownerId(),
			weaponSplIds: [SPLATTERSHOT, SPLATTERSHOT_NOUVEAU],
		});

		for (const weaponId of [SPLATTERSHOT, SPLATTERSHOT_NOUVEAU]) {
			const rows = await BuildRepository.builds().forWeapon(weaponId).execute();
			expect(rows.map((row) => row.id)).toEqual([id]);
		}
	});

	test("forWeapon ranks plus tier and top 500 first, alt skins included", async () => {
		const plusOwner = await UserFactory.create(null, { plusTier: 1 });
		await createBuild({ ownerId: ownerId(), title: "no tier" });
		await createBuild({
			ownerId: plusOwner.id,
			title: "plus",
			weaponSplIds: [HERO_SHOT_REPLICA],
		});

		const rows = await BuildRepository.builds()
			.forWeapon(SPLATTERSHOT)
			.withAuthor()
			.execute();

		expect(rows.map((row) => row.title)).toEqual(["plus", "no tier"]);
		expect(rows[0].author).toMatchObject({ id: plusOwner.id, plusTier: 1 });
		expect(rows[1].author).toMatchObject({ id: ownerId(), plusTier: null });
	});

	describe("sortAbilitiesIfPreferred", () => {
		const UNSORTED: BuildAbilitiesTuple = [
			["ISM", "SSU", "ISM", "SSU"],
			["ISM", "SSU", "ISM", "SSU"],
			["ISM", "SSU", "ISM", "SSU"],
		];

		test("sorts other users' builds", async () => {
			await createBuild({ ownerId: ownerId(), abilities: UNSORTED });

			const [build] = await withUserId(otherUserId(), () =>
				BuildRepository.builds().sortAbilitiesIfPreferred().execute(),
			);

			expect(build.abilities).toEqual(sortAbilities(UNSORTED));
			expect(build.abilities).not.toEqual(UNSORTED);
		});

		test("keeps the viewer's own builds in entered order", async () => {
			await createBuild({ ownerId: ownerId(), abilities: UNSORTED });

			const [build] = await withUserId(ownerId(), () =>
				BuildRepository.builds().sortAbilitiesIfPreferred().execute(),
			);

			expect(build.abilities).toEqual(UNSORTED);
		});
	});
});

describe("BuildRepository.findAllPopularAbilitiesByWeaponId", () => {
	// All SS: each gear sums to 10 (main) + 3*3 (subs) = 19, total 57.
	const SS_ABILITIES: BuildAbilitiesTuple = [
		["SS", "SS", "SS", "SS"],
		["SS", "SS", "SS", "SS"],
		["SS", "SS", "SS", "SS"],
	];

	beforeEach(async () => {
		await users.create(2);
	});

	test("counts each user at most once across signature buckets", async () => {
		// without per-user dedup both users would inflate both buckets (4 total instead of <= 2)
		await createBuild({ ownerId: users.id(1) });
		await createBuild({ ownerId: users.id(1), abilities: SS_ABILITIES });
		await createBuild({ ownerId: users.id(2) });
		await createBuild({ ownerId: users.id(2), abilities: SS_ABILITIES });

		const rows =
			await BuildRepository.findAllPopularAbilitiesByWeaponId(SPLATTERSHOT);
		const totalCount = rows.reduce((acc, row) => acc + row.count, 0);

		expect(totalCount).toBeLessThanOrEqual(2);
		expect(rows.every((row) => row.count <= 2)).toBe(true);
	});

	test("only counts public builds", async () => {
		await createBuild({ ownerId: users.id(1) });
		await createBuild({ ownerId: users.id(2), isPrivate: 1 });

		const rows =
			await BuildRepository.findAllPopularAbilitiesByWeaponId(SPLATTERSHOT);

		// only one user with a public build → filtered by HAVING count > 1
		expect(rows).toHaveLength(0);
	});

	test("folds alt skins via canonicalWeaponSplId", async () => {
		await createBuild({ ownerId: users.id(1) });
		await createBuild({
			ownerId: users.id(2),
			weaponSplIds: [HERO_SHOT_REPLICA],
		});

		const rows =
			await BuildRepository.findAllPopularAbilitiesByWeaponId(SPLATTERSHOT);

		expect(rows).toEqual([
			{ abilitiesSignature: EXPECTED_SIGNATURE, count: 2 },
		]);
		// the alt-skin id alone should also resolve to the same canonical bucket
		const altRows =
			await BuildRepository.findAllPopularAbilitiesByWeaponId(
				HERO_SHOT_REPLICA,
			);
		expect(altRows).toEqual(rows);
	});
});
