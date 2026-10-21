import { predictWin, type Rating, rating } from "openskill";
import { rate } from "~/features/mmr/mmr-utils";
import type { LobbySide } from "../lobbies-constants";
import * as LobbySet from "./LobbySet";

/** A set counted towards the lobby's ratings, in the order they were played. */
export type RatedSet = LobbySet.SetLike;

/**
 * Lobby-local openskill ratings computed from the lobby's game history. Everyone starts at the default rating
 * and only finished (confirmed or forfeited) sets count, so nothing needs fixing when a set is voided or a
 * player leaves. Each played map is one rating update and winning the set is one more on top: winning 2–1
 * counts as 3 wins and 1 loss. A forfeited set rates the maps actually played plus the set win of the side
 * that didn't forfeit. Never touches the global SendouQ ratings.
 */
export function ratings(sets: RatedSet[]): Map<number, Rating> {
	const result = new Map<number, Rating>();
	const currentRating = (userId: number) => result.get(userId) ?? rating();

	const update = (winners: number[], losers: number[]) => {
		if (winners.length === 0 || losers.length === 0) return;

		const [newWinnerRatings, newLoserRatings] = rate([
			winners.map(currentRating),
			losers.map(currentRating),
		]);

		for (const [i, userId] of winners.entries()) {
			result.set(userId, newWinnerRatings[i]);
		}
		for (const [i, userId] of losers.entries()) {
			result.set(userId, newLoserRatings[i]);
		}
	};

	for (const set of sets) {
		if (!LobbySet.isFinished(set)) continue;

		const players = (side: LobbySide) => LobbySet.playersOf(set, side);

		for (const game of set.games) {
			if (!game.winnerSide) continue;

			update(
				players(game.winnerSide),
				players(LobbySet.otherSide(game.winnerSide)),
			);
		}

		const setWinner = LobbySet.winnerSide(set);
		if (setWinner) {
			update(players(setWinner), players(LobbySet.otherSide(setWinner)));
		}
	}

	return result;
}

/** Rating of the user, the default one for someone who hasn't played a rated set yet. */
export function ratingOf(ratingsByUserId: Map<number, Rating>, userId: number) {
	return ratingsByUserId.get(userId) ?? rating();
}

/** Predicted probability (0-1) of the alpha team beating the bravo team. */
export function winProbability(alpha: Rating[], bravo: Rating[]) {
	return predictWin([alpha, bravo])[0];
}
