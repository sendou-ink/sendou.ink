import * as XRankPlacementRepository from "~/features/top-search/XRankPlacementRepository.server";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";
import * as SplatoonFaker from "../core/SplatoonFaker";

const PLACED_ON = { month: 1, year: 2024 };

/**
 * Creates X Rank placements. `playerSplId` is the in-game id of the player who
 * placed — the repository creates their `SplatoonPlayer` row if the id is new, so
 * repeating an id places the same player again. `playerUserId` is the site user
 * whose results they are.
 *
 * Rank counts up, since a month's leaderboard has no two players at the same rank.
 */
export const { create } = defineFactory({
	defaults: ({ seq }) => ({
		badges: "",
		bannerSplId: 1,
		mode: "SZ" as const,
		month: PLACED_ON.month,
		year: PLACED_ON.year,
		name: faker.internet.username(),
		nameDiscriminator: String(seq).padStart(4, "0"),
		power: faker.number.int({ min: 2000, max: 3300 }),
		rank: seq,
		region: "WEST" as const,
		title: faker.lorem.words(2),
		weaponSplId: SplatoonFaker.mainWeapon(),
	}),
	insert: async (args: XRankPlacementRepository.XRankPlacementInsertArgs) => {
		const [id] = await XRankPlacementRepository.insertMany([args]);

		return { id };
	},
});
