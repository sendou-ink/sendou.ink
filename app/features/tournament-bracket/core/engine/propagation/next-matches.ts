import type { BracketData, MatchData, Side } from "../types";
import * as helpers from "./helpers";
import { Store } from "./store";
import { Propagator } from "./traversal";

/** A match whose winner or loser moves on to the side of another match. */
export interface FeederMatch {
	matchId: number;
	outcome: "WINNER" | "LOSER";
	side: Side;
}

/**
 * Ids of the matches the winner and the loser of each match move on to, keyed by match id. Round robin
 * and swiss matches move no one and are left out, as are matches whose teams leave the stage.
 */
export function nextMatchIdsByMatchId(
	data: BracketData,
): Map<number, number[]> {
	const result = new Map<number, number[]>();
	for (const { match, winnerMatch, loserMatch } of nextMatches(data)) {
		const nextMatchIds = [winnerMatch, loserMatch].flatMap((next) =>
			next ? [next.id] : [],
		);

		if (nextMatchIds.length > 0) result.set(match.id, nextMatchIds);
	}

	return result;
}

/**
 * The matches feeding each elimination match's sides, keyed by the fed match's id: e.g. the winner of
 * Winners Round 1.1 to its opponent1. A grand finals reset, played by the grand finals' teams, has no feeders.
 */
export function feederMatchesByMatchId(
	data: BracketData,
): Map<number, FeederMatch[]> {
	const result = new Map<number, FeederMatch[]>();
	const add = (fedMatchId: number, feeder: FeederMatch) => {
		result.set(fedMatchId, [...(result.get(fedMatchId) ?? []), feeder]);
	};

	for (const {
		match,
		location,
		roundNumber,
		roundCount,
		winnerMatch,
		loserMatch,
	} of nextMatches(data)) {
		if (location === "final_group") continue;

		const winnerSide = helpers.getNextSide(
			match.number,
			roundNumber,
			roundCount,
			location,
		);
		if (winnerMatch) {
			add(winnerMatch.id, {
				matchId: match.id,
				outcome: "WINNER",
				side: winnerSide,
			});
		}
		if (loserMatch) {
			add(loserMatch.id, {
				matchId: match.id,
				outcome: "LOSER",
				side:
					location === "single_bracket"
						? winnerSide
						: helpers.getNextSideLoserBracket(
								match.number,
								loserMatch,
								roundNumber,
							),
			});
		}
	}

	return result;
}

function nextMatches(data: BracketData) {
	const store = new Store(data);
	const propagator = new Propagator(store);

	const result: Array<{
		match: MatchData;
		location: ReturnType<typeof helpers.getMatchLocation>;
		roundNumber: number;
		roundCount: number;
		winnerMatch: MatchData | null;
		loserMatch: MatchData | null;
	}> = [];
	for (const match of store.data.match) {
		const stage = store.stageById(match.stageId);
		if (!stage) throw new Error("Stage not found.");
		if (helpers.isRoundRobin(stage) || helpers.isSwiss(stage)) continue;

		const round = store.roundById(match.roundId);
		if (!round) throw new Error("Round not found.");

		const { roundNumber, roundCount } = propagator.getRoundPositionalInfo(
			match.roundId,
		);
		const location = helpers.getMatchLocation(stage.type, round.section);
		const [winnerMatch, loserMatch] = propagator.getNextMatches(
			match,
			location,
			stage,
			roundNumber,
			roundCount,
		);

		result.push({
			match,
			location,
			roundNumber,
			roundCount,
			winnerMatch: winnerMatch ?? null,
			loserMatch: loserMatch ?? null,
		});
	}

	return result;
}
