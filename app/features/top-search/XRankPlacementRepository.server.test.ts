import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { db } from "~/db/sql";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { dbReset } from "~/utils/Test";
import * as XRankPlacementRepository from "./XRankPlacementRepository.server";

let placementCounter = 0;

const createUser = async (discordId: string) => {
	const result = await db
		.insertInto("User")
		.values({ discordId, discordName: discordId })
		.returning("id")
		.executeTakeFirstOrThrow();

	return result.id;
};

const createSplatoonPlayer = async (
	splId: string,
	userId?: number | null,
) => {
	const result = await db
		.insertInto("SplatoonPlayer")
		.values({ splId, userId: userId ?? null })
		.returning("id")
		.executeTakeFirstOrThrow();

	return result.id;
};

const createXRankPlacement = async (args: {
	playerId: number;
	power: number;
	region?: "WEST" | "JPN";
	rank?: number;
	weaponSplId?: MainWeaponId;
}) => {
	placementCounter++;

	await db
		.insertInto("XRankPlacement")
		.values({
			playerId: args.playerId,
			power: args.power,
			badges: "[]",
			bannerSplId: 1,
			mode: "SZ",
			month: 1,
			year: 2024,
			name: "Test Player",
			nameDiscriminator: "0000",
			rank: args.rank ?? placementCounter,
			region: args.region ?? "WEST",
			title: "Test",
			weaponSplId: args.weaponSplId ?? (0 as MainWeaponId),
		})
		.execute();
};

describe("refreshAllPeakXp", () => {
	beforeEach(() => {
		placementCounter = 0;
		dbReset();
	});

	afterEach(() => {
		dbReset();
	});

	test("sets peakXp to max power for each player", async () => {
		const player1Id = await createSplatoonPlayer("player1");
		const player2Id = await createSplatoonPlayer("player2");

		await createXRankPlacement({ playerId: player1Id, power: 2500 });
		await createXRankPlacement({ playerId: player1Id, power: 2700 });
		await createXRankPlacement({ playerId: player1Id, power: 2600 });

		await createXRankPlacement({ playerId: player2Id, power: 3000 });
		await createXRankPlacement({ playerId: player2Id, power: 2800 });

		await XRankPlacementRepository.refreshAllPeakXp();

		const players = await db
			.selectFrom("SplatoonPlayer")
			.select(["id", "peakXp"])
			.orderBy("id", "asc")
			.execute();

		expect(players[0].peakXp).toBe(2700);
		expect(players[1].peakXp).toBe(3000);
	});

	test("sets peakXp to null for player with no placements", async () => {
		const playerId = await createSplatoonPlayer("player1");

		await XRankPlacementRepository.refreshAllPeakXp();

		const player = await db
			.selectFrom("SplatoonPlayer")
			.select("peakXp")
			.where("id", "=", playerId)
			.executeTakeFirstOrThrow();

		expect(player.peakXp).toBeNull();
	});
});

describe("refreshTenStarWeapons", () => {
	beforeEach(() => {
		placementCounter = 0;
		dbReset();
	});

	afterEach(() => {
		dbReset();
	});

	test("JPN placement qualifies regardless of rank", async () => {
		const userId = await createUser("user1");
		const playerId = await createSplatoonPlayer("player1", userId);

		await createXRankPlacement({
			playerId,
			power: 2500,
			region: "JPN",
			rank: 450,
			weaponSplId: 40 as MainWeaponId,
		});

		await XRankPlacementRepository.refreshTenStarWeapons();

		const rows = await db
			.selectFrom("TenStarWeapon")
			.selectAll()
			.execute();

		expect(rows).toHaveLength(1);
		expect(rows[0].userId).toBe(userId);
		expect(rows[0].weaponSplId).toBe(40);
	});

	test("WEST placement with rank <= 100 qualifies", async () => {
		const userId = await createUser("user1");
		const playerId = await createSplatoonPlayer("player1", userId);

		await createXRankPlacement({
			playerId,
			power: 3000,
			region: "WEST",
			rank: 50,
			weaponSplId: 40 as MainWeaponId,
		});

		await XRankPlacementRepository.refreshTenStarWeapons();

		const rows = await db
			.selectFrom("TenStarWeapon")
			.selectAll()
			.execute();

		expect(rows).toHaveLength(1);
		expect(rows[0].weaponSplId).toBe(40);
	});

	test("WEST placement with rank > 100 does not qualify", async () => {
		const userId = await createUser("user1");
		const playerId = await createSplatoonPlayer("player1", userId);

		await createXRankPlacement({
			playerId,
			power: 2500,
			region: "WEST",
			rank: 101,
			weaponSplId: 40 as MainWeaponId,
		});

		await XRankPlacementRepository.refreshTenStarWeapons();

		const rows = await db
			.selectFrom("TenStarWeapon")
			.selectAll()
			.execute();

		expect(rows).toHaveLength(0);
	});

	test("unlinked players are excluded", async () => {
		const playerId = await createSplatoonPlayer("player1");

		await createXRankPlacement({
			playerId,
			power: 2500,
			region: "JPN",
			rank: 1,
			weaponSplId: 40 as MainWeaponId,
		});

		await XRankPlacementRepository.refreshTenStarWeapons();

		const rows = await db
			.selectFrom("TenStarWeapon")
			.selectAll()
			.execute();

		expect(rows).toHaveLength(0);
	});

	test("duplicate weapon placements produce one row", async () => {
		const userId = await createUser("user1");
		const playerId = await createSplatoonPlayer("player1", userId);

		await createXRankPlacement({
			playerId,
			power: 2500,
			region: "JPN",
			rank: 100,
			weaponSplId: 40 as MainWeaponId,
		});
		await createXRankPlacement({
			playerId,
			power: 2700,
			region: "JPN",
			rank: 50,
			weaponSplId: 40 as MainWeaponId,
		});

		await XRankPlacementRepository.refreshTenStarWeapons();

		const rows = await db
			.selectFrom("TenStarWeapon")
			.selectAll()
			.execute();

		expect(rows).toHaveLength(1);
	});
});

describe("refreshTenStarWeapons with userId", () => {
	beforeEach(() => {
		placementCounter = 0;
		dbReset();
	});

	afterEach(() => {
		dbReset();
	});

	test("only affects the target user", async () => {
		const user1Id = await createUser("user1");
		const user2Id = await createUser("user2");
		const player1Id = await createSplatoonPlayer("player1", user1Id);
		const player2Id = await createSplatoonPlayer("player2", user2Id);

		await createXRankPlacement({
			playerId: player1Id,
			power: 2500,
			region: "JPN",
			rank: 100,
			weaponSplId: 40 as MainWeaponId,
		});
		await createXRankPlacement({
			playerId: player2Id,
			power: 2500,
			region: "JPN",
			rank: 200,
			weaponSplId: 50 as MainWeaponId,
		});

		await XRankPlacementRepository.refreshTenStarWeapons();

		const beforeRows = await db
			.selectFrom("TenStarWeapon")
			.selectAll()
			.execute();
		expect(beforeRows).toHaveLength(2);

		await db
			.updateTable("SplatoonPlayer")
			.set({ userId: null })
			.where("id", "=", player1Id)
			.execute();

		await XRankPlacementRepository.refreshTenStarWeapons(user1Id);

		const afterRows = await db
			.selectFrom("TenStarWeapon")
			.selectAll()
			.execute();

		expect(afterRows).toHaveLength(1);
		expect(afterRows[0].userId).toBe(user2Id);
		expect(afterRows[0].weaponSplId).toBe(50);
	});
});
