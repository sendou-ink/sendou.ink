import { notify } from "../features/notifications/core/notify.server";
import { tournamentDataCached } from "../features/tournament-bracket/core/Tournament.server";
import * as TournamentRepository from "../features/tournament/TournamentRepository.server";
import { logger } from "../utils/logger";
import { Routine } from "./routine.server";

export const NotifyCheckInStartRoutine = new Routine({
	name: "NotifyCheckInStart",
	func: async () => {
		const now = new Date();
		const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
		const tournaments = await TournamentRepository.findAllBetweenTwoTimestamps({
			startTime: now,
			endTime: oneHourFromNow,
		});

		for (const { tournamentId } of tournaments) {
			const tournament = await tournamentDataCached({
				tournamentId: tournamentId!,
				user: undefined,
			});

			if (tournament.ctx.settings.isTest) {
				continue;
			}

			logger.info(
				`Notifying check-in start for tournament ${tournament.ctx.id}`,
			);
			await notify({
				notification: {
					type: "TO_CHECK_IN_OPENED",
					meta: {
						tournamentId: tournament.ctx.id,
						tournamentName: tournament.ctx.name,
					},
					pictureUrl: tournament.ctx.logoSrc,
				},
				userIds: tournament.ctx.teams
					.flatMap((team) => team.members.map((member) => member.userId))
					.concat(tournament.ctx.staff.map((staff) => staff.id)),
			});
		}
	},
});
