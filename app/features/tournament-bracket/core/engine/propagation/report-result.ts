import invariant from "~/utils/invariant";
import type { BracketData, EngineResult, ReportResultInput } from "../types";
import { Store } from "./store";
import { Propagator } from "./traversal";

/**
 * Applies a result to a match and propagates:
 * winner/loser advancement (SE/DE), BYE cascades, forfeit wins, grand final
 * + bracket reset, next-round unlocking (RR), no downstream propagation for
 * swiss/RR completed matches. Throws on locked/completed matches unless
 * input.force.
 */
export function reportResult(
	data: BracketData,
	input: ReportResultInput,
): EngineResult {
	const store = new Store(data);
	const propagator = new Propagator(store);

	const stored = store.select("match", input.matchId);
	invariant(stored, "Match not found");

	propagator.updateMatch(
		stored,
		{ opponent1: input.opponent1, opponent2: input.opponent2 },
		input.force,
	);

	return { data: store.data, changedMatches: store.changedMatches() };
}
