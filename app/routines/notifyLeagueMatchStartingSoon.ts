import { notify } from "../features/notifications/core/notify.server";
import { LEAGUE_SCHEDULING } from "../features/tournament-match/core/LeagueScheduling";
import * as TournamentMatchRepository from "../features/tournament-match/TournamentMatchRepository.server";
import { databaseTimestampNow } from "../utils/dates";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

export const NotifyLeagueMatchStartingSoonRoutine = new Routine({
	name: "NotifyLeagueMatchStartingSoon",
	func: async () => {
		const now = databaseTimestampNow();

		const matches = await TournamentMatchRepository.matches()
			.undecided()
			.scheduledBetween(now, now + LEAGUE_SCHEDULING.STARTING_SOON_SECONDS)
			.withTournamentId()
			.withTeams()
			.execute();

		for (const match of matches) {
			logger.info(
				`Notifying league set starting soon for match ${match.id} with ${match.teams.flatMap((team) => team.members).length} participants`,
			);

			for (const team of match.teams) {
				const opponent = match.teams.find((other) => other.id !== team.id);
				if (!opponent) continue;

				await notify({
					notification: {
						type: "TO_LEAGUE_MATCH_STARTING_SOON",
						meta: {
							tournamentId: match.tournamentId,
							matchId: match.id,
							opponentTeamName: opponent.name,
						},
					},
					userIds: team.members.map((member) => member.userId),
				});
			}
		}
	},
});
