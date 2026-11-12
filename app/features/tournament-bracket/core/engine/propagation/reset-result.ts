import type { BracketData, EngineResult } from "../types";
import { hasResultDownstream } from "./downstream-result";
import * as helpers from "./helpers";
import { Store } from "./store";
import { Propagator } from "./traversal";

/** Clears a match's results and rolls back everything propagated from it. */
export function resetMatchResults(
	data: BracketData,
	matchId: number,
): EngineResult {
	const store = new Store(data);
	const propagator = new Propagator(store);

	const stored = store.matchById(matchId);
	if (!stored) throw new Error("Match not found.");

	const stage = store.stageById(stored.stageId);
	if (!stage) throw new Error("Stage not found.");

	if (hasResultDownstream(store, propagator, stored))
		throw new Error("The match is locked.");

	helpers.clearWinner(stored);
	store.markMatchChanged(stored);

	if (!helpers.isRoundRobin(stage) && !helpers.isSwiss(stage))
		propagator.updateRelatedMatches(stored);

	return { data: store.data, changedMatches: store.changedMatches() };
}
