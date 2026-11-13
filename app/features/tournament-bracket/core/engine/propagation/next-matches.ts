import type { BracketData } from "../types";
import * as helpers from "./helpers";
import { Store } from "./store";
import { Propagator } from "./traversal";

/**
 * Ids of the matches the winner and the loser of each match move on to, keyed by match id. Round robin
 * and swiss matches move no one and are left out, as are matches whose teams leave the stage.
 */
export function nextMatchIdsByMatchId(
	data: BracketData,
): Map<number, number[]> {
	const store = new Store(data);
	const propagator = new Propagator(store);

	const result = new Map<number, number[]>();
	for (const match of store.data.match) {
		const stage = store.stageById(match.stageId);
		if (!stage) throw new Error("Stage not found.");
		if (helpers.isRoundRobin(stage) || helpers.isSwiss(stage)) continue;

		const round = store.roundById(match.roundId);
		if (!round) throw new Error("Round not found.");

		const { roundNumber, roundCount } = propagator.getRoundPositionalInfo(
			match.roundId,
		);
		const nextMatchIds = propagator
			.getNextMatches(
				match,
				helpers.getMatchLocation(stage.type, round.section),
				stage,
				roundNumber,
				roundCount,
			)
			.flatMap((next) => (next ? [next.id] : []));

		if (nextMatchIds.length > 0) result.set(match.id, nextMatchIds);
	}

	return result;
}
