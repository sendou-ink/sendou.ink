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

		const matches = await TournamentMatchRepository.findScheduledBetween({
			startsAt: now,
			endsAt: now + LEAGUE_SCHEDULING.STARTING_SOON_SECONDS,
		});

		for (const match of matches) {
			logger.info(
				`Notifying league set starting soon for match ${match.id} with ${match.members.length} participants`,
			);

			const sides = [
				{ id: match.teamOneId, opponentName: match.teamTwoName },
				{ id: match.teamTwoId, opponentName: match.teamOneName },
			];
			for (const side of sides) {
				await notify({
					notification: {
						type: "TO_LEAGUE_MATCH_STARTING_SOON",
						meta: {
							tournamentId: match.tournamentId,
							matchId: match.id,
							opponentTeamName: side.opponentName,
						},
					},
					userIds: match.members
						.filter((member) => member.tournamentTeamId === side.id)
						.map((member) => member.userId),
				});
			}
		}
	},
});
