import { describe, expect, test } from "vitest";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { DEFAULT_LEADERBOARD_MAX_SIZE } from "../leaderboards-constants";
import {
	filterByWeaponCategory,
	ownEntryPeek,
	shownUserLeaderboard,
	type UserLeaderboardWithAdditionsItem,
} from "./leaderboards.server";

const FIRST_TIED_RANK = DEFAULT_LEADERBOARD_MAX_SIZE - 2;

/**
 * Leaderboard where five players are tied in SP across the shown-size cutoff:
 * indices 497–501 (0-based) all share placementRank 498, like players who
 * finished the season having played every match in the same stack do.
 */
const leaderboardWithTieAcrossCutoff = () =>
	Array.from({ length: DEFAULT_LEADERBOARD_MAX_SIZE + 2 }, (_, i) => {
		const placementRank = i >= FIRST_TIED_RANK - 1 ? FIRST_TIED_RANK : i + 1;

		return {
			id: i + 1,
			placementRank,
			power: 2100 - placementRank,
		} as unknown as UserLeaderboardWithAdditionsItem;
	});

describe("shownUserLeaderboard & ownEntryPeek", () => {
	test("player tied across the cutoff is visible in the table or via own entry peek", async () => {
		const leaderboard = leaderboardWithTieAcrossCutoff();
		const cutOffUserId = DEFAULT_LEADERBOARD_MAX_SIZE + 2;

		const shownIds = shownUserLeaderboard(leaderboard).map((entry) => entry.id);

		if (!shownIds.includes(cutOffUserId)) {
			const peek = await ownEntryPeek({
				leaderboard,
				userId: cutOffUserId,
				season: 1,
			});

			expect(peek).not.toBeNull();
		}
	});

	test("shows every tied player at the cutoff rank", () => {
		const leaderboard = leaderboardWithTieAcrossCutoff();

		const shown = shownUserLeaderboard(leaderboard);

		expect(shown).toHaveLength(leaderboard.length);
	});

	test("cuts players ranked below the max size", () => {
		const leaderboard = Array.from(
			{ length: DEFAULT_LEADERBOARD_MAX_SIZE + 2 },
			(_, i) =>
				({
					id: i + 1,
					placementRank: i + 1,
					power: 2100 - i,
				}) as unknown as UserLeaderboardWithAdditionsItem,
		);

		const shown = shownUserLeaderboard(leaderboard);

		expect(shown).toHaveLength(DEFAULT_LEADERBOARD_MAX_SIZE);
	});
});

describe("filterByWeaponCategory", () => {
	const SPLOOSH_O_MATIC: MainWeaponId = 0;
	const SPLATTERSHOT: MainWeaponId = 40;
	const LUNA_BLASTER: MainWeaponId = 200;

	test("keeps a Sploosh-o-matic (weapon id 0) player on the shooters leaderboard", () => {
		const entries = [
			{ id: 1, weaponSplId: SPLOOSH_O_MATIC },
			{ id: 2, weaponSplId: SPLATTERSHOT },
			{ id: 3, weaponSplId: LUNA_BLASTER },
			{ id: 4, weaponSplId: undefined },
		];

		const filtered = filterByWeaponCategory(entries, "SHOOTERS");

		expect(filtered.map((entry) => entry.id)).toEqual([1, 2]);
	});
});
