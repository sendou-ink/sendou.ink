import type { LobbySide } from "../../lobbies-constants";
import type * as LobbySet from "../LobbySet";

/** A set of 1-4 (alpha) vs. 5-8 (bravo) with the given map winners, reported by the winners of each map. */
export function setOf({
	winners = [],
	bestOf = 3,
	confirmed = false,
	forfeitingSide = null,
	disputed = false,
	alpha = [1, 2, 3, 4],
	bravo = [5, 6, 7, 8],
	sittingOut = [],
}: {
	winners?: LobbySide[];
	bestOf?: number;
	confirmed?: boolean;
	forfeitingSide?: LobbySide | null;
	disputed?: boolean;
	alpha?: number[];
	bravo?: number[];
	sittingOut?: number[];
} = {}): LobbySet.SetLike {
	const games = Array.from({ length: bestOf }, (_, i) => {
		const winnerSide = winners[i] ?? null;

		return {
			winnerSide,
			reportedByUserId:
				winnerSide === "ALPHA"
					? alpha[0]
					: winnerSide === "BRAVO"
						? bravo[0]
						: null,
		};
	});

	return {
		bestOf,
		forfeitingSide,
		disputedAt: disputed ? 1 : null,
		confirmedAt: confirmed ? 1 : null,
		games,
		participants: [
			...alpha.map((userId) => ({ userId, side: "ALPHA" as const })),
			...bravo.map((userId) => ({ userId, side: "BRAVO" as const })),
			...sittingOut.map((userId) => ({ userId, side: null })),
		],
	};
}
