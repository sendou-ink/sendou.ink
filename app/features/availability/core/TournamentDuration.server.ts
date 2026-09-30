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
 * Start plus {@link TournamentDuration.estimateSeconds} sized by the expected team count. Every
 * view showing or blocking out a tournament's window goes through this so they agree.
 */
export async function estimatedEndsAt(tournament: EstimatedTournament) {
	return estimatedEndsAtWith(tournament, await SeriesTeamCount.lookup());
}

/** {@link estimatedEndsAt} for callers estimating many tournaments off one resolved lookup. */
export function estimatedEndsAtWith(
	tournament: EstimatedTournament,
	expectedTeamCount: (tournament: EstimatedTournament) => number,
) {
	return (
		tournament.startsAt +
		TournamentDuration.estimateSeconds({
			minMembersPerTeam: tournament.minMembersPerTeam,
			bracketTypes: tournament.bracketTypes,
			teamCount: expectedTeamCount(tournament),
		})
	);
}
