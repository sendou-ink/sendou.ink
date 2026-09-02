import {
	isMatchByeCompleted,
	isMatchCompleted,
	isMatchStarted,
} from "../status";
import type { BracketData, EngineResult } from "../types";
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
	if (!stored) throw Error("Match not found.");

	const stage = store.stageById(stored.stageId);
	if (!stage) throw Error("Stage not found.");

	const group = store.groupById(stored.groupId);
	if (!group) throw Error("Group not found.");

	const { roundNumber, roundCount } = propagator.getRoundPositionalInfo(
		stored.roundId,
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
				(isMatchStarted(match) || isMatchCompleted(match)) &&
				!isMatchByeCompleted(match),
		)
	)
		throw Error("The match is locked.");

	helpers.clearWinner(stored);
	store.markMatchChanged(stored);

	if (!helpers.isRoundRobin(stage) && !helpers.isSwiss(stage))
		propagator.updateRelatedMatches(stored);

	return { data: store.data, changedMatches: store.changedMatches() };
}
