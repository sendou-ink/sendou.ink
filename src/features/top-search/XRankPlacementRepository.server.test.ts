import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { db } from "~/db/sql";
import { dbReset } from "~/utils/Test";
import * as XRankPlacementRepository from "./XRankPlacementRepository.server";

let placementCounter = 0;

const createSplatoonPlayer = async (splId: string) => {
	const result = await db
		.insertInto("SplatoonPlayer")
		.values({ splId })
		.returning("id")
		.executeTakeFirstOrThrow();

	return result.id;
};

const createXRankPlacement = async ({
	playerId,
	power,
}: {
	playerId: number;
	power: number;
}) => {
	placementCounter++;

	await db
		.insertInto("XRankPlacement")
		.values({
			playerId,
			power,
			badges: "[]",
			bannerSplId: 1,
			mode: "SZ",
			month: 1,
			year: 2024,
			name: "Test Player",
			nameDiscriminator: "0000",
			rank: placementCounter,
			region: "WEST",
			title: "Test",
			weaponSplId: 0,
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
