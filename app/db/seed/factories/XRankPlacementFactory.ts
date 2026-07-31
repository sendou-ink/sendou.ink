import * as XRankPlacementRepository from "~/features/top-search/XRankPlacementRepository.server";
import invariant from "~/utils/invariant";
import { defineFactory } from "../core/defineFactory";
import { faker } from "../core/faker";
import * as SplatoonFaker from "../core/SplatoonFaker";

const PLACED_ON = { month: 1, year: 2024 };

type InsertArgs = Omit<
	XRankPlacementRepository.XRankPlacementInsertArgs,
	"playerSplId"
> & {
	/** Defaults to one derived from `playerUserId`, for a player who only ever
	 * appears as that user. */
	playerSplId?: string;
};

type Options = {
	/** Derive `SplatoonPlayer.peakXp` from the placements, as the import does once
	 * it has added a month's worth of them. */
	refreshPeakXp?: boolean;
};

/**
 * Creates X Rank placements. `playerSplId` is the in-game id of the player who
 * placed — the repository creates their `SplatoonPlayer` row if the id is new, so
 * repeating an id places the same player again. `playerUserId` is the site user
 * whose results they are, and stands in for the in-game id when none is given.
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
	insert: async ({ playerSplId, ...args }: InsertArgs) => {
		const splId = playerSplId ?? `player-${args.playerUserId}`;
		invariant(
			playerSplId || args.playerUserId,
			"A placement needs either an in-game id or a user to derive one from",
		);

		const [id] = await XRankPlacementRepository.insertMany([
			{ ...args, playerSplId: splId },
		]);

		return { id };
	},
	applyOptions: async (_placement, { refreshPeakXp }: Options) => {
		if (!refreshPeakXp) return;

		await XRankPlacementRepository.refreshAllPeakXp();
	},
});
