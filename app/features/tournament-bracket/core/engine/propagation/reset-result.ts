import * as helpers from "../helpers";
import type { BracketData, EngineResult } from "../types";
import { MatchStatus } from "../types";
import { Store } from "./store";
import { Propagator } from "./traversal";

/**
 * Clears a match's results and rolls back everything that was propagated
 * from it. 1:1 with the old reset.ts, including the swiss/round_robin early
 * return.
 */
export function resetMatchResults(
	data: BracketData,
	matchId: number,
): EngineResult {
	const store = new Store(data);
	const propagator = new Propagator(store);

	const stored = store.select("match", matchId);
	if (!stored) throw Error("Match not found.");

	const stage = store.select("stage", stored.stage_id);
	if (!stage) throw Error("Stage not found.");

	const group = store.select("group", stored.group_id);
	if (!group) throw Error("Group not found.");

	const { roundNumber, roundCount } = propagator.getRoundPositionalInfo(
		stored.round_id,
	);
	const matchLocation = helpers.getMatchLocation(stage.type, group.number);
	const nextMatches =
		stage.type !== "round_robin" && stage.type !== "swiss"
			? propagator.getNextMatches(
					stored,
					matchLocation,
					stage,
					roundNumber,
					roundCount,
				)
			: [];

	if (
		nextMatches.some(
			(match) =>
				match &&
				match.status >= MatchStatus.Running &&
				!helpers.isMatchByeCompleted(match),
		)
	)
		throw Error("The match is locked.");

	helpers.resetMatchResults(stored);
	propagator.applyMatchUpdate(stored);

	if (!helpers.isRoundRobin(stage) && !helpers.isSwiss(stage))
		propagator.updateRelatedMatches(stored, true, true);

	return { data: store.data, changedMatches: store.changedMatches() };
}
