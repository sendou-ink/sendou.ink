import * as R from "remeda";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import * as LobbySet from "./LobbySet";

export interface LeaderboardRow {
	userId: number;
	setWins: number;
	setLosses: number;
	mapWins: number;
	mapLosses: number;
	/** 0-100, `null` with no maps played */
	mapWinPercentage: number | null;
	/** Weapons played on the maps, most used first */
	weaponSplIds: MainWeaponId[];
}

/**
 * Leaderboard of the lobby's players from its finished (confirmed or forfeited) sets: set and map records and
 * the weapons played. Sorted by set wins, then map win percentage.
 *
 * @param weapons one per player per map played, reported by hand or read by the scanner
 * @param roomMemberIds get a row even before their first finished set
 */
export function rows({
	sets,
	weapons,
	roomMemberIds = [],
}: {
	sets: LobbySet.SetLike[];
	weapons: Array<{ userId: number; weaponSplId: MainWeaponId }>;
	roomMemberIds?: number[];
}): LeaderboardRow[] {
	const byUserId = new Map<
		number,
		Omit<LeaderboardRow, "mapWinPercentage" | "weaponSplIds">
	>();
	const rowOf = (userId: number) => {
		const existing = byUserId.get(userId);
		if (existing) return existing;

		const row = { userId, setWins: 0, setLosses: 0, mapWins: 0, mapLosses: 0 };
		byUserId.set(userId, row);
		return row;
	};

	for (const set of sets) {
		if (!LobbySet.isFinished(set)) continue;

		const setWinner = LobbySet.winnerSide(set);

		for (const participant of set.participants) {
			if (!participant.side) continue;

			const row = rowOf(participant.userId);
			if (setWinner === participant.side) row.setWins++;
			else row.setLosses++;

			for (const game of set.games) {
				if (!game.winnerSide) continue;

				if (game.winnerSide === participant.side) row.mapWins++;
				else row.mapLosses++;
			}
		}
	}

	for (const userId of roomMemberIds) rowOf(userId);

	const weaponsByUserId = R.groupBy(weapons, (weapon) => weapon.userId);

	const result = [...byUserId.values()].map((row) => {
		const mapCount = row.mapWins + row.mapLosses;
		const weaponCounts = new Map<MainWeaponId, number>();
		for (const { weaponSplId } of weaponsByUserId[row.userId] ?? []) {
			weaponCounts.set(weaponSplId, (weaponCounts.get(weaponSplId) ?? 0) + 1);
		}

		return {
			...row,
			mapWinPercentage:
				mapCount === 0 ? null : Math.round((row.mapWins / mapCount) * 100),
			weaponSplIds: R.sortBy(
				[...weaponCounts.entries()],
				[([, count]) => count, "desc"],
			).map(([weaponSplId]) => weaponSplId),
		};
	});

	return R.sortBy(
		result,
		[(row) => row.setWins, "desc"],
		[(row) => row.mapWinPercentage ?? -1, "desc"],
		[(row) => row.mapWins, "desc"],
	);
}
