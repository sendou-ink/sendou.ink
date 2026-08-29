import type { Tables } from "~/db/tables";
import * as SeriesTeamCount from "~/features/tournament-organization/core/SeriesTeamCount.server";
import * as TournamentDuration from "./TournamentDuration";

interface EstimatedTournament {
	name: string;
	organizationId: number | null;
	startsAt: number;
	minMembersPerTeam: number;
	bracketTypes: Array<Tables["TournamentStage"]["type"]>;
	/** Teams registered so far. */
	teamCount: number;
}

/**
 * When a tournament is estimated to end: its start plus
 * {@link TournamentDuration.estimateSeconds}, sized by the count the event is
 * expected to draw rather than the one registered so far. Every surface showing
 * or blocking out a tournament's window goes through this so the two agree.
 */
export async function estimatedEndsAt(tournament: EstimatedTournament) {
	const expectedTeamCount = await SeriesTeamCount.lookup();

	return (
		tournament.startsAt +
		TournamentDuration.estimateSeconds({
			minMembersPerTeam: tournament.minMembersPerTeam,
			bracketTypes: tournament.bracketTypes,
			teamCount: expectedTeamCount(tournament),
		})
	);
}
