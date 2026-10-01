import { beforeEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as XRankPlacementFactory from "~/db/seed/factories/XRankPlacementFactory";
import { db } from "~/db/sql";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import * as XRankPlacementRepository from "./XRankPlacementRepository.server";

const SPLATTERSHOT: MainWeaponId = 40;
const SPLATTERSHOT_NOUVEAU: MainWeaponId = 41;

const PLACED_ON = { month: 1, year: 2024 };

const peakXpOf = (playerSplId: string) =>
	db
		.selectFrom("SplatoonPlayer")
		.select("peakXp")
		.where("splId", "=", playerSplId)
		.executeTakeFirstOrThrow();

const findTenStarWeapons = () =>
	db.selectFrom("TenStarWeapon").selectAll().execute();

describe("refreshAllPeakXp", () => {
	test("sets peakXp to max power for each player", async () => {
		for (const power of [2500, 2700, 2600]) {
			await XRankPlacementFactory.create({ playerSplId: "player-1", power });
		}

		for (const power of [3000, 2800]) {
			await XRankPlacementFactory.create({ playerSplId: "player-2", power });
		}

		await XRankPlacementRepository.refreshAllPeakXp();

		expect((await peakXpOf("player-1")).peakXp).toEqual({
			overall: 2700,
			tentatek: 2700,
			takoroka: null,
		});
		expect((await peakXpOf("player-2")).peakXp).toEqual({
			overall: 3000,
			tentatek: 3000,
			takoroka: null,
		});
	});

	test("splits peakXp by division (region)", async () => {
		await XRankPlacementFactory.create({
			playerSplId: "player-1",
			power: 2700,
			region: "WEST",
		});
		await XRankPlacementFactory.create({
			playerSplId: "player-1",
			power: 2900,
			region: "JPN",
		});

		await XRankPlacementRepository.refreshAllPeakXp();

		expect((await peakXpOf("player-1")).peakXp).toEqual({
			overall: 2900,
			tentatek: 2700,
			takoroka: 2900,
		});
	});

	test("sets peakXp to null for player with no placements", async () => {
		await XRankPlacementFactory.create({
			playerSplId: "player-1",
			power: 2500,
			...PLACED_ON,
		});
		await XRankPlacementRepository.refreshAllPeakXp();

		await XRankPlacementRepository.delete(PLACED_ON);
		await XRankPlacementRepository.refreshAllPeakXp();

		expect((await peakXpOf("player-1")).peakXp).toBeNull();
	});
});

describe("refreshTenStarWeapons", () => {
	const users = UserFactory.pool();
	const userId = () => users.id(1);

	beforeEach(async () => {
		await users.create(1);
	});

	test("JPN placement qualifies regardless of rank", async () => {
		await XRankPlacementFactory.create({
			playerSplId: "player-1",
			playerUserId: userId(),
			power: 2500,
			region: "JPN",
			rank: 450,
			weaponSplId: SPLATTERSHOT,
		});

		await XRankPlacementRepository.refreshTenStarWeapons();

		const rows = await findTenStarWeapons();

		expect(rows).toHaveLength(1);
		expect(rows[0].userId).toBe(userId());
		expect(rows[0].weaponSplId).toBe(SPLATTERSHOT);
	});

	test("WEST placement with rank <= 100 qualifies", async () => {
		await XRankPlacementFactory.create({
			playerSplId: "player-1",
			playerUserId: userId(),
			power: 3000,
			region: "WEST",
			rank: 50,
			weaponSplId: SPLATTERSHOT,
		});

		await XRankPlacementRepository.refreshTenStarWeapons();

		const rows = await findTenStarWeapons();

		expect(rows).toHaveLength(1);
		expect(rows[0].weaponSplId).toBe(SPLATTERSHOT);
	});

	test("WEST placement with rank > 100 does not qualify", async () => {
		await XRankPlacementFactory.create({
			playerSplId: "player-1",
			playerUserId: userId(),
			power: 2500,
			region: "WEST",
			rank: 101,
			weaponSplId: SPLATTERSHOT,
		});

		await XRankPlacementRepository.refreshTenStarWeapons();

		expect(await findTenStarWeapons()).toHaveLength(0);
	});

	test("unlinked players are excluded", async () => {
		await XRankPlacementFactory.create({
			playerSplId: "player-1",
			power: 2500,
			region: "JPN",
			rank: 1,
			weaponSplId: SPLATTERSHOT,
		});

		await XRankPlacementRepository.refreshTenStarWeapons();

		expect(await findTenStarWeapons()).toHaveLength(0);
	});

	test("duplicate weapon placements produce one row", async () => {
		await XRankPlacementFactory.create({
			playerSplId: "player-1",
			playerUserId: userId(),
			power: 2500,
			region: "JPN",
			rank: 100,
			weaponSplId: SPLATTERSHOT,
		});
		await XRankPlacementFactory.create({
			playerSplId: "player-1",
			playerUserId: userId(),
			power: 2700,
			region: "JPN",
			rank: 50,
			weaponSplId: SPLATTERSHOT,
		});

		await XRankPlacementRepository.refreshTenStarWeapons();

		expect(await findTenStarWeapons()).toHaveLength(1);
	});
});

describe("placements.claimedBy", () => {
	test("returns only the placements of the user's player", async () => {
		const [claimer, other] = await UserFactory.createMany(2);

		const { id: claimedId } = await XRankPlacementFactory.create({
			playerUserId: claimer.id,
		});
		await XRankPlacementFactory.create({ playerUserId: other.id });
		await XRankPlacementFactory.create({ playerSplId: "unclaimed" });

		const placements = await XRankPlacementRepository.placements()
			.claimedBy(claimer.id)
			.execute();

		expect(placements.map((placement) => placement.id)).toEqual([claimedId]);
	});
});

describe("placements.inDivision", () => {
	test.each([
		{ division: "tentatek", regions: ["WEST"] },
		{ division: "takoroka", regions: ["JPN"] },
		{ division: "both", regions: ["WEST", "JPN"] },
	] as const)(
		"$division keeps $regions placements",
		async ({ division, regions }) => {
			await XRankPlacementFactory.create({
				playerSplId: "p-1",
				region: "WEST",
			});
			await XRankPlacementFactory.create({ playerSplId: "p-2", region: "JPN" });

			const placements = await XRankPlacementRepository.placements()
				.inDivision(division)
				.execute();

			expect(placements.map((placement) => placement.region)).toEqual(regions);
		},
	);
});

describe("refreshTenStarWeapons with userId", () => {
	test("only affects the target user", async () => {
		const [user1, user2] = await UserFactory.createMany(2);

		await XRankPlacementFactory.create({
			playerSplId: "player-1",
			playerUserId: user1.id,
			power: 2500,
			region: "JPN",
			rank: 100,
			weaponSplId: SPLATTERSHOT,
		});
		await XRankPlacementFactory.create({
			playerSplId: "player-2",
			playerUserId: user2.id,
			power: 2500,
			region: "JPN",
			rank: 200,
			weaponSplId: SPLATTERSHOT_NOUVEAU,
		});

		await XRankPlacementRepository.refreshTenStarWeapons();

		expect(await findTenStarWeapons()).toHaveLength(2);

		await XRankPlacementRepository.unlinkPlayerByUserId(user1.id);

		await XRankPlacementRepository.refreshTenStarWeapons(user1.id);

		const afterRows = await findTenStarWeapons();

		expect(afterRows).toHaveLength(1);
		expect(afterRows[0].userId).toBe(user2.id);
		expect(afterRows[0].weaponSplId).toBe(SPLATTERSHOT_NOUVEAU);
	});
});
