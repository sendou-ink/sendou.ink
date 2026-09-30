/** Pure bracket engine, no I/O: callers hydrate BracketData via BracketRepository and persist the returned delta. */

export { create } from "./create";
export {
	hasThirdPlaceMatch,
	roundRobinGroupCount,
	swissRoundCount,
} from "./create/settings";
export { endDroppedTeamMatches } from "./propagation/dropped-teams";
export { reportResult } from "./propagation/report-result";
export { resetMatchResults } from "./propagation/reset-result";
export {
	endSet,
	reopenMatch,
	reportGameResult,
	undoGameResult,
} from "./propagation/set";
export * from "./status";
export { generateRound, groupHasActiveTeams } from "./swiss/pairing";
export * from "./types";
