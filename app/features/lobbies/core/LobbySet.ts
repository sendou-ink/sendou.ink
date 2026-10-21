import type { LobbySide } from "../lobbies-constants";

/** What a set's state is derived from: its games (maps) in order and who played on which side. */
export interface SetLike {
	bestOf: number;
	forfeitingSide: LobbySide | null;
	disputedAt: number | null;
	confirmedAt: number | null;
	games: Array<{
		winnerSide: LobbySide | null;
		reportedByUserId: number | null;
	}>;
	participants: Array<{ userId: number; side: LobbySide | null }>;
}

/**
 * - `REPORTING`: maps being played and reported
 * - `AWAITING_CONFIRMATION`: decided, the team that didn't report the deciding map has to confirm
 * - `DISPUTED`: the confirming team said the result is wrong, stays so until the result changes or they confirm
 * - `CONFIRMED`: both teams agree, the set counts
 * - `FORFEITED`: a player left mid-set, their team lost without confirmation needed
 */
export type SetStatus =
	| "REPORTING"
	| "AWAITING_CONFIRMATION"
	| "DISPUTED"
	| "CONFIRMED"
	| "FORFEITED";

/** Maps won by each side and how many it takes to win the set. */
export function score(set: Pick<SetLike, "bestOf" | "games">) {
	const alpha = set.games.filter((game) => game.winnerSide === "ALPHA").length;
	const bravo = set.games.filter((game) => game.winnerSide === "BRAVO").length;

	return { alpha, bravo, mapsToWin: Math.ceil(set.bestOf / 2) };
}

/** Side that won the set, by maps or by the other side forfeiting. `null` while undecided. */
export function winnerSide(
	set: Pick<SetLike, "bestOf" | "games" | "forfeitingSide">,
): LobbySide | null {
	if (set.forfeitingSide) return otherSide(set.forfeitingSide);

	const { alpha, bravo, mapsToWin } = score(set);
	if (alpha >= mapsToWin) return "ALPHA";
	if (bravo >= mapsToWin) return "BRAVO";

	return null;
}

/** Current state of the set, see {@link SetStatus}. */
export function status(set: SetLike): SetStatus {
	if (set.forfeitingSide) return "FORFEITED";
	if (set.confirmedAt) return "CONFIRMED";
	if (!winnerSide(set)) return "REPORTING";
	if (set.disputedAt) return "DISPUTED";

	return "AWAITING_CONFIRMATION";
}

/** Whether the set is over for good: confirmed or forfeited. The room can move on to the next set. */
export function isFinished(set: SetLike) {
	const current = status(set);

	return current === "CONFIRMED" || current === "FORFEITED";
}

/** Index of the map being played, `null` when the set is decided. */
export function currentGameIndex(set: SetLike) {
	if (winnerSide(set)) return null;

	const index = set.games.findIndex((game) => game.winnerSide === null);

	return index === -1 ? null : index;
}

/** How many maps have been reported. */
export function reportedCount(set: Pick<SetLike, "games">) {
	return set.games.filter((game) => game.winnerSide !== null).length;
}

/** Side the user played on, `null` if they sat the set out or weren't in it. */
export function sideOf(set: Pick<SetLike, "participants">, userId: number) {
	return (
		set.participants.find((participant) => participant.userId === userId)
			?.side ?? null
	);
}

/** User ids of the side's players. */
export function playersOf(set: Pick<SetLike, "participants">, side: LobbySide) {
	return set.participants
		.filter((participant) => participant.side === side)
		.map((participant) => participant.userId);
}

/** Whether the user may report the winner of the current map. */
export function canReport(set: SetLike, userId: number) {
	return status(set) === "REPORTING" && sideOf(set, userId) !== null;
}

/**
 * Whether the user may undo the latest map report. While reporting anyone playing may, once decided only the
 * side that reported the deciding map (the other side confirms or disputes instead).
 */
export function canUndo(set: SetLike, userId: number) {
	const side = sideOf(set, userId);
	if (!side) return false;

	const current = status(set);
	if (current === "REPORTING") return reportedCount(set) > 0;
	if (current === "AWAITING_CONFIRMATION" || current === "DISPUTED") {
		return reporterSide(set) === side;
	}

	return false;
}

/** Whether the user may confirm the decided result, i.e. plays on the side that didn't report it. */
export function canConfirm(set: SetLike, userId: number) {
	const current = status(set);
	if (current !== "AWAITING_CONFIRMATION" && current !== "DISPUTED") {
		return false;
	}

	const side = sideOf(set, userId);

	return side !== null && side !== reporterSide(set);
}

/** Whether the user may say the decided result is wrong. */
export function canDispute(set: SetLike, userId: number) {
	return status(set) === "AWAITING_CONFIRMATION" && canConfirm(set, userId);
}

/** The opposing side. */
export function otherSide(side: LobbySide): LobbySide {
	return side === "ALPHA" ? "BRAVO" : "ALPHA";
}

/** Side of whoever reported the map that decided the set, the other side is the one to confirm. */
function reporterSide(set: SetLike): LobbySide | null {
	if (!winnerSide(set) || set.forfeitingSide) return null;

	const decidingGame = set.games.findLast((game) => game.winnerSide !== null);
	if (!decidingGame?.reportedByUserId) return null;

	return sideOf(set, decidingGame.reportedByUserId);
}
