import { beforeEach, describe, expect, test } from "vitest";
import * as BuildFactory from "~/db/seed/factories/BuildFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as XRankPlacementFactory from "~/db/seed/factories/XRankPlacementFactory";
import { db } from "~/db/sql";
import type {
	BuildAbilitiesTuple,
	MainWeaponId,
} from "~/modules/in-game-lists/types";
import * as BuildRepository from "./BuildRepository.server";

let owner: { id: number };
let otherOwner: { id: number };

// Splattershot (40) is the canonical base, Hero Shot Replica (45) is an alt skin
// that should be folded to 40 by the canonical id mapping.
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
	ownerId: owner.id,
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
		[owner, otherOwner] = await UserFactory.createMany(2);
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
			await makeTop500(owner.id, SPLATTERSHOT);

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

	test("findAllByWeaponId.weapons[].isTop500 matches the sortValue formula", async () => {
		await makeTop500(owner.id, SPLATTERSHOT);

		await createBuild({
			ownerId: owner.id,
			weaponSplIds: [SPLATTERSHOT, SPLATTERSHOT_NOUVEAU],
		});

		const [build] = await BuildRepository.findAllByWeaponId(SPLATTERSHOT, {
			limit: 10,
		});

		const splattershot = build.weapons.find(
			(w) => w.weaponSplId === SPLATTERSHOT,
		);
		const nouveau = build.weapons.find(
			(w) => w.weaponSplId === SPLATTERSHOT_NOUVEAU,
		);

		expect(splattershot?.isTop500).toBe(1);
		expect(nouveau?.isTop500).toBe(0);
	});

	test("a multi-weapon build is returned by findAllByWeaponId for each of its weapons", async () => {
		await createBuild({
			ownerId: owner.id,
			title: "Multi-weapon Build",
			weaponSplIds: [SPLATTERSHOT, SPLATTERSHOT_NOUVEAU],
		});

		const splattershotBuilds = await BuildRepository.findAllByWeaponId(
			SPLATTERSHOT,
			{ limit: 10 },
		);
		const nouveauBuilds = await BuildRepository.findAllByWeaponId(
			SPLATTERSHOT_NOUVEAU,
			{ limit: 10 },
		);

		expect(splattershotBuilds).toHaveLength(1);
		expect(splattershotBuilds[0].title).toBe("Multi-weapon Build");
		expect(nouveauBuilds).toHaveLength(1);
		expect(nouveauBuilds[0].id).toBe(splattershotBuilds[0].id);
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
		[owner, otherOwner] = await UserFactory.createMany(2);
	});

	test("counts each user at most once across signature buckets", async () => {
		// Each user has two Splattershot builds with different signatures.
		// Without per-user dedup, both users would inflate both buckets and
		// the total count across rows would be 4 instead of <=2.
		await createBuild({ ownerId: owner.id });
		await createBuild({ ownerId: owner.id, abilities: SS_ABILITIES });
		await createBuild({ ownerId: otherOwner.id });
		await createBuild({ ownerId: otherOwner.id, abilities: SS_ABILITIES });

		const rows =
			await BuildRepository.findAllPopularAbilitiesByWeaponId(SPLATTERSHOT);
		const totalCount = rows.reduce((acc, row) => acc + row.count, 0);

		expect(totalCount).toBeLessThanOrEqual(2);
		expect(rows.every((row) => row.count <= 2)).toBe(true);
	});

	test("only counts public builds", async () => {
		await createBuild({ ownerId: owner.id });
		await createBuild({ ownerId: otherOwner.id, isPrivate: 1 });

		const rows =
			await BuildRepository.findAllPopularAbilitiesByWeaponId(SPLATTERSHOT);

		// only one user with a public build → filtered by HAVING count > 1
		expect(rows).toHaveLength(0);
	});

	test("folds alt skins via canonicalWeaponSplId", async () => {
		await createBuild({ ownerId: owner.id });
		await createBuild({
			ownerId: otherOwner.id,
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
