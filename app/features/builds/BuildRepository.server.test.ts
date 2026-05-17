import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { db } from "~/db/sql";
import type {
	BuildAbilitiesTuple,
	MainWeaponId,
} from "~/modules/in-game-lists/types";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import * as AdminRepository from "../admin/AdminRepository.server";
import * as BuildRepository from "./BuildRepository.server";

const OWNER_ID = 1;

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
	overrides: Partial<Parameters<typeof BuildRepository.create>[0]> = {},
): Parameters<typeof BuildRepository.create>[0] => ({
	ownerId: OWNER_ID,
	title: "Test Build",
	description: null,
	modes: null,
	headGearSplId: null,
	clothesGearSplId: null,
	shoesGearSplId: null,
	weaponSplIds: [SPLATTERSHOT],
	abilities: ABILITIES,
	private: 0,
	...overrides,
});

const insertSplatoonPlayer = async (userId: number, splId: string) => {
	const { id } = await db
		.insertInto("SplatoonPlayer")
		.values({ splId, userId })
		.returning("id")
		.executeTakeFirstOrThrow();
	return id;
};

const insertXRankPlacement = async (
	playerId: number,
	weaponSplId: MainWeaponId,
	rank: number,
) => {
	await db
		.insertInto("XRankPlacement")
		.values({
			playerId,
			weaponSplId,
			badges: "[]",
			bannerSplId: 1,
			mode: "SZ",
			month: 1,
			year: 2024,
			name: "Test Player",
			nameDiscriminator: "0000",
			power: 2500,
			rank,
			region: "WEST",
			title: "Test",
		})
		.execute();
};

const buildById = (id: number) =>
	db
		.selectFrom("Build")
		.select(["abilitiesSignature", "private"])
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
		.select(["weaponSplId", "ability", "abilityPoints"])
		.where("buildId", "=", buildId)
		.execute();

const onlyBuildId = async () => {
	const row = await db
		.selectFrom("Build")
		.select("id")
		.executeTakeFirstOrThrow();
	return row.id;
};

describe("BuildRepository.create — computeBuildData", () => {
	beforeEach(async () => {
		await dbInsertUsers(2);
	});

	afterEach(() => {
		dbReset();
	});

	describe("abilitiesSignature & ability sums", () => {
		test("writes the serialized abilitiesSignature sorted by AP desc", async () => {
			await BuildRepository.create(baseArgs());

			const build = await buildById(await onlyBuildId());
			expect(build.abilitiesSignature).toBe(EXPECTED_SIGNATURE);
		});

		test("inserts one BuildAbilitySum row per distinct ability with summed AP", async () => {
			await BuildRepository.create(baseArgs());

			const sums = await buildAbilitySumsByBuildId(await onlyBuildId());

			expect(sums).toHaveLength(2);
			expect(sums).toContainEqual({ ability: "ISM", abilityPoints: 38 });
			expect(sums).toContainEqual({ ability: "ISS", abilityPoints: 19 });
		});

		test("does not insert BuildAbilitySum rows for private builds", async () => {
			await BuildRepository.create(baseArgs({ private: 1 }));

			const sums = await buildAbilitySumsByBuildId(await onlyBuildId());
			expect(sums).toHaveLength(0);
		});

		test("still writes abilitiesSignature for private builds", async () => {
			await BuildRepository.create(baseArgs({ private: 1 }));

			const build = await buildById(await onlyBuildId());
			expect(build.abilitiesSignature).toBe(EXPECTED_SIGNATURE);
		});
	});

	describe("BuildWeaponAbility rows", () => {
		test("inserts one row per weapon × ability for public builds", async () => {
			await BuildRepository.create(
				baseArgs({ weaponSplIds: [SPLATTERSHOT, SPLATTERSHOT_NOUVEAU] }),
			);

			const rows = await buildWeaponAbilitiesByBuildId(await onlyBuildId());
			expect(rows).toHaveLength(4);
			expect(rows).toContainEqual({
				weaponSplId: SPLATTERSHOT,
				ability: "ISM",
				abilityPoints: 38,
			});
			expect(rows).toContainEqual({
				weaponSplId: SPLATTERSHOT_NOUVEAU,
				ability: "ISS",
				abilityPoints: 19,
			});
		});

		test("folds alt skins to their canonical weapon id", async () => {
			await BuildRepository.create(
				baseArgs({ weaponSplIds: [HERO_SHOT_REPLICA] }),
			);

			const rows = await buildWeaponAbilitiesByBuildId(await onlyBuildId());
			const weaponIds = new Set(rows.map((r) => r.weaponSplId));
			expect(weaponIds).toEqual(new Set([SPLATTERSHOT]));
		});

		test("does not insert any rows for private builds", async () => {
			await BuildRepository.create(baseArgs({ private: 1 }));

			const rows = await buildWeaponAbilitiesByBuildId(await onlyBuildId());
			expect(rows).toHaveLength(0);
		});
	});

	describe("BuildWeapon.canonicalWeaponSplId", () => {
		test("stores the canonical id alongside the original weaponSplId", async () => {
			await BuildRepository.create(
				baseArgs({ weaponSplIds: [HERO_SHOT_REPLICA] }),
			);

			const weapons = await buildWeaponsByBuildId(await onlyBuildId());
			expect(weapons).toHaveLength(1);
			expect(weapons[0].weaponSplId).toBe(HERO_SHOT_REPLICA);
			expect(weapons[0].canonicalWeaponSplId).toBe(SPLATTERSHOT);
		});
	});

	describe("sortValue", () => {
		test("defaults to tier 4 (sortValue = 9) when owner has no PlusTier", async () => {
			await BuildRepository.create(baseArgs());

			const [weapon] = await buildWeaponsByBuildId(await onlyBuildId());
			expect(weapon.sortValue).toBe(9);
		});

		test("uses owner's PlusTier (tier 2 → sortValue = 5)", async () => {
			await AdminRepository.replacePlusTiers([
				{ userId: OWNER_ID, plusTier: 2 },
			]);

			await BuildRepository.create(baseArgs());

			const [weapon] = await buildWeaponsByBuildId(await onlyBuildId());
			expect(weapon.sortValue).toBe(5);
		});

		test("is null for private builds regardless of tier", async () => {
			await AdminRepository.replacePlusTiers([
				{ userId: OWNER_ID, plusTier: 1 },
			]);

			await BuildRepository.create(baseArgs({ private: 1 }));

			const [weapon] = await buildWeaponsByBuildId(await onlyBuildId());
			expect(weapon.sortValue).toBeNull();
		});

		test("subtracts 1 when the weapon is top500 for the owner", async () => {
			const playerId = await insertSplatoonPlayer(OWNER_ID, "owner-spl-id");
			await insertXRankPlacement(playerId, SPLATTERSHOT, 1);

			await BuildRepository.create(
				baseArgs({ weaponSplIds: [SPLATTERSHOT, SPLATTERSHOT_NOUVEAU] }),
			);

			const weapons = await buildWeaponsByBuildId(await onlyBuildId());
			const splattershot = weapons.find((w) => w.weaponSplId === SPLATTERSHOT);
			const nouveau = weapons.find(
				(w) => w.weaponSplId === SPLATTERSHOT_NOUVEAU,
			);

			expect(splattershot?.sortValue).toBe(8);
			expect(nouveau?.sortValue).toBe(9);
		});

		test("combines top500 with the owner's PlusTier", async () => {
			await AdminRepository.replacePlusTiers([
				{ userId: OWNER_ID, plusTier: 1 },
			]);
			const playerId = await insertSplatoonPlayer(OWNER_ID, "owner-spl-id");
			await insertXRankPlacement(playerId, SPLATTERSHOT, 1);

			await BuildRepository.create(baseArgs());

			const [weapon] = await buildWeaponsByBuildId(await onlyBuildId());
			expect(weapon.sortValue).toBe(2);
		});
	});

	test("allByWeaponId.weapons[].isTop500 matches the sortValue formula", async () => {
		const playerId = await insertSplatoonPlayer(OWNER_ID, "owner-spl-id");
		await insertXRankPlacement(playerId, SPLATTERSHOT, 1);

		await BuildRepository.create(
			baseArgs({ weaponSplIds: [SPLATTERSHOT, SPLATTERSHOT_NOUVEAU] }),
		);

		const [build] = await BuildRepository.allByWeaponId(SPLATTERSHOT, {
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

	test("a multi-weapon build is returned by allByWeaponId for each of its weapons", async () => {
		await BuildRepository.create(
			baseArgs({
				title: "Multi-weapon Build",
				weaponSplIds: [SPLATTERSHOT, SPLATTERSHOT_NOUVEAU],
			}),
		);

		const splattershotBuilds = await BuildRepository.allByWeaponId(
			SPLATTERSHOT,
			{ limit: 10 },
		);
		const nouveauBuilds = await BuildRepository.allByWeaponId(
			SPLATTERSHOT_NOUVEAU,
			{ limit: 10 },
		);

		expect(splattershotBuilds).toHaveLength(1);
		expect(splattershotBuilds[0].title).toBe("Multi-weapon Build");
		expect(nouveauBuilds).toHaveLength(1);
		expect(nouveauBuilds[0].id).toBe(splattershotBuilds[0].id);
	});
});

describe("BuildRepository.popularAbilitiesByWeaponId", () => {
	// All SS: each gear sums to 10 (main) + 3*3 (subs) = 19, total 57.
	const SS_ABILITIES: BuildAbilitiesTuple = [
		["SS", "SS", "SS", "SS"],
		["SS", "SS", "SS", "SS"],
		["SS", "SS", "SS", "SS"],
	];

	beforeEach(async () => {
		await dbInsertUsers(2);
	});

	afterEach(() => {
		dbReset();
	});

	test("counts each user at most once across signature buckets", async () => {
		// Each user has two Splattershot builds with different signatures.
		// Without per-user dedup, both users would inflate both buckets and
		// the total count across rows would be 4 instead of <=2.
		await BuildRepository.create(baseArgs({ ownerId: 1 }));
		await BuildRepository.create(
			baseArgs({ ownerId: 1, abilities: SS_ABILITIES }),
		);
		await BuildRepository.create(baseArgs({ ownerId: 2 }));
		await BuildRepository.create(
			baseArgs({ ownerId: 2, abilities: SS_ABILITIES }),
		);

		const rows = await BuildRepository.popularAbilitiesByWeaponId(SPLATTERSHOT);
		const totalCount = rows.reduce((acc, row) => acc + row.count, 0);

		expect(totalCount).toBeLessThanOrEqual(2);
		expect(rows.every((row) => row.count <= 2)).toBe(true);
	});

	test("only counts public builds", async () => {
		await BuildRepository.create(baseArgs({ ownerId: 1 }));
		await BuildRepository.create(baseArgs({ ownerId: 2, private: 1 }));

		const rows = await BuildRepository.popularAbilitiesByWeaponId(SPLATTERSHOT);

		// only one user with a public build → filtered by HAVING count > 1
		expect(rows).toHaveLength(0);
	});

	test("folds alt skins via canonicalWeaponSplId", async () => {
		await BuildRepository.create(baseArgs({ ownerId: 1 }));
		await BuildRepository.create(
			baseArgs({ ownerId: 2, weaponSplIds: [HERO_SHOT_REPLICA] }),
		);

		const rows = await BuildRepository.popularAbilitiesByWeaponId(SPLATTERSHOT);

		expect(rows).toEqual([
			{ abilitiesSignature: EXPECTED_SIGNATURE, count: 2 },
		]);
		// the alt-skin id alone should also resolve to the same canonical bucket
		const altRows =
			await BuildRepository.popularAbilitiesByWeaponId(HERO_SHOT_REPLICA);
		expect(altRows).toEqual(rows);
	});
});
