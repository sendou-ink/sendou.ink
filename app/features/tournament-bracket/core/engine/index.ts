/**
 * Pure bracket engine. No I/O anywhere in this module tree — callers hydrate
 * BracketData via BracketRepository, call engine functions, persist the
 * returned delta via BracketRepository.
 */

export { create } from "./create";
export { hasThirdPlaceMatch, roundRobinGroupCount } from "./create/settings";
export { endDroppedTeamMatches } from "./propagation/dropped-teams";
export { reportResult } from "./propagation/report-result";
export { resetMatchResults } from "./propagation/reset-result";
export { generateRound } from "./swiss/pairing";
export * from "./types";
