/**
 * Rankings tab of a lobby: each player's set and map record over the lobby's finished sets and the
 * weapons they played, and how every player fared against every other.
 */
import * as R from "remeda";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import * as LobbySet from "./LobbySet";

/** A player's record over the lobby's finished sets. */
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
	/** 1-based, shared by players with the same record */
	placement: number;
}

/**
 * Leaderboard of the lobby's players from its finished (confirmed or forfeited) sets: set and map records and
 * the weapons played. Sorted by set wins, then map win percentage. Players tied on all of these share the placement.
 *
 * @param weapons one per player per map played, reported by hand or read by the scanner
 * @param roomMemberIds get a row of zeros until the lobby's first set is over
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
		Omit<LeaderboardRow, "mapWinPercentage" | "weaponSplIds" | "placement">
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

	if (!sets.some(LobbySet.isFinished)) {
		for (const userId of roomMemberIds) rowOf(userId);
	}

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

	const sorted = R.sortBy(
		result,
		[(row) => row.setWins, "desc"],
		[(row) => row.mapWinPercentage ?? -1, "desc"],
		[(row) => row.mapWins, "desc"],
	);

	const withPlacements: LeaderboardRow[] = [];
	for (const [i, row] of sorted.entries()) {
		const previous = withPlacements.at(-1);
		const placement =
			previous && isTied(previous, row) ? previous.placement : i + 1;

		withPlacements.push({ ...row, placement });
	}

	return withPlacements;
}

/** A player's record against one opponent over the finished sets they played on opposite sides. */
export interface HeadToHeadRecord {
	setWins: number;
	setLosses: number;
	mapWins: number;
	mapLosses: number;
}

/**
 * Head-to-head records of the lobby's finished (confirmed or forfeited) sets, looked up as
 * `records[userId]?.[opponentId]`. A pair that never played on opposite sides has no record.
 */
export function headToHead(
	sets: LobbySet.SetLike[],
): Record<number, Record<number, HeadToHeadRecord>> {
	const records: Record<number, Record<number, HeadToHeadRecord>> = {};

	for (const set of sets) {
		if (!LobbySet.isFinished(set)) continue;

		const setWinner = LobbySet.winnerSide(set);

		for (const player of set.participants) {
			if (!player.side) continue;

			for (const opponent of set.participants) {
				if (!opponent.side || opponent.side === player.side) continue;

				records[player.userId] ??= {};
				records[player.userId][opponent.userId] ??= {
					setWins: 0,
					setLosses: 0,
					mapWins: 0,
					mapLosses: 0,
				};
				const record = records[player.userId][opponent.userId];

				if (setWinner === player.side) record.setWins++;
				else record.setLosses++;

				for (const game of set.games) {
					if (!game.winnerSide) continue;

					if (game.winnerSide === player.side) record.mapWins++;
					else record.mapLosses++;
				}
			}
		}
	}

	return records;
}

function isTied(
	a: Pick<LeaderboardRow, "setWins" | "mapWinPercentage" | "mapWins">,
	b: Pick<LeaderboardRow, "setWins" | "mapWinPercentage" | "mapWins">,
) {
	return (
		a.setWins === b.setWins &&
		a.mapWinPercentage === b.mapWinPercentage &&
		a.mapWins === b.mapWins
	);
}
