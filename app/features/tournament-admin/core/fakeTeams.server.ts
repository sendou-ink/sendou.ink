import * as TeamPick from "~/features/tournament/core/TeamPick";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";

/**
 * Adds `count` fake teams to a test tournament, ready to play its format: full rosters of fake players, a random
 * legal counterpick map pool when teams pick maps and checked in when check-in has opened. Caller checks the count.
 */
export function addFakeTeams({
	tournament,
	count,
}: {
	tournament: Tournament;
	count: number;
}) {
	const teamPick = tournament.teamPickSettings;

	return TournamentTeamRepository.insertFakeTeams({
		tournamentId: tournament.ctx.id,
		count,
		membersPerTeam: tournament.minMembersPerTeam,
		mapPool: teamPick
			? () => TeamPick.randomTeamPool({ teamPick, pool: tournament.mapPool })
			: null,
		isCheckedIn: tournament.regularCheckInStartInThePast,
	});
}
