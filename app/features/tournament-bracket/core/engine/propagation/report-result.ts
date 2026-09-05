import invariant from "~/utils/invariant";
import type { BracketData, EngineResult, ReportResultInput } from "../types";
import { Store } from "./store";
import { Propagator } from "./traversal";

/** Applies a result and propagates it (SE/DE advancement, BYE cascades, grand final + reset). Throws on locked matches. */
export function reportResult(
	data: BracketData,
	input: ReportResultInput,
): EngineResult {
	const store = new Store(data);
	const propagator = new Propagator(store);

	const stored = store.matchById(input.matchId);
	invariant(stored, "Match not found");

	propagator.updateMatch(stored, input);

	return { data: store.data, changedMatches: store.changedMatches() };
}
