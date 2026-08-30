import type { Tables } from "~/db/tables";

const HOUR_SECONDS = 60 * 60;

const SINGLE_ELIMINATION_ONLY_HOURS = 2;
const SMALL_TEAM_SIZE_HOURS = 2.5;
const FOUR_VS_FOUR_HOURS = 4;
const LARGE_FOUR_VS_FOUR_HOURS = 4.5;
/** Team count from which a 4v4 tournament gets the larger estimate. */
const LARGE_TOURNAMENT_TEAM_COUNT = 32;

/** The largest value {@link estimateSeconds} can return, for widening fetch windows. */
export const MAX_ESTIMATE_SECONDS = LARGE_FOUR_VS_FOUR_HOURS * HOUR_SECONDS;

/**
 * Estimated length of a tournament in seconds, used to block its players'
 * availability from the event's start. Only for a tournament played in one
 * sitting, the numbers being measured over whole events.
 *
 * The actual length is not in the data model, so this is a constant table
 * measured from the production database (August 2026): 3222 finalized
 * tournaments, duration = scheduled start → last reported game result, leagues
 * and test tournaments excluded. Hours:
 *
 * | case                        |    n | p25 | med | p75 | p90 |
 * | --------------------------- | ---- | --- | --- | --- | --- |
 * | 1v1                         |  273 | 1.5 | 2.0 | 2.5 | 3.1 |
 * | 2v2                         |  282 | 1.9 | 2.3 | 2.7 | 3.0 |
 * | 3v3                         |   30 | 1.6 | 2.1 | 2.5 | 2.7 |
 * | 4v4                         | 2593 | 2.6 | 3.2 | 3.8 | 4.3 |
 * | single elim only (any size) |  129 | 0.8 | 1.3 | 1.7 | 2.1 |
 * | 4v4, 32+ teams              |  309 | 3.4 | 3.7 | 4.2 | 4.5 |
 *
 * What the data showed:
 *
 * - Team size and team count are the strong predictors. Format mostly proxies
 *   team count (round robin → elim and swiss events are the bigger ones); the
 *   one format that stands out on its own is a lone single elimination
 *   bracket, roughly half the length of everything else.
 * - Team count raises duration (4v4 medians: <8 teams 2.2, 8–15 3.1, 16–31
 *   3.7, 32–63 3.7, 64+ 4.2) but at estimate time the registered count is
 *   only a lower bound of the final count, so it only ever raises the
 *   estimate above the size default, never lowers it. Callers pass what the
 *   event is *expected* to draw, see `SeriesTeamCount.lookup`.
 * - SZ-only vs multi-mode map pools made no meaningful difference (medians
 *   3.4 vs 3.2), so modes are not a dimension.
 *
 * The estimates sit at ≈p75 of their case: slightly generous, because a block
 * that runs a bit long beats showing a player free while they are still
 * playing. 84.7% of 4v4 tournaments end within their window.
 */
export function estimateSeconds({
	minMembersPerTeam,
	bracketTypes,
	teamCount,
}: {
	minMembersPerTeam: number;
	bracketTypes: Array<Tables["TournamentStage"]["type"]>;
	/** Teams the tournament is expected to draw, not necessarily the registered count. */
	teamCount: number;
}) {
	const isSingleEliminationOnly =
		bracketTypes.length === 1 && bracketTypes[0] === "single_elimination";
	if (isSingleEliminationOnly) {
		return SINGLE_ELIMINATION_ONLY_HOURS * HOUR_SECONDS;
	}

	if (minMembersPerTeam < 4) return SMALL_TEAM_SIZE_HOURS * HOUR_SECONDS;

	return teamCount >= LARGE_TOURNAMENT_TEAM_COUNT
		? LARGE_FOUR_VS_FOUR_HOURS * HOUR_SECONDS
		: FOUR_VS_FOUR_HOURS * HOUR_SECONDS;
}
