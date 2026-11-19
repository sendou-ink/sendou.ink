import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import { notify } from "~/features/notifications/core/notify.server";
import * as PendingCheckIns from "~/features/tournament/core/PendingCheckIns.server";
import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import * as TournamentLFGRepository from "~/features/tournament-lfg/TournamentLFGRepository.server";

/**
 * Call before writing a user onto a tournament team: takes them out of the LFG queue, otherwise their
 * own looking group could end up being the team they join.
 * @returns user ids whose chat room set changed, for `notifyRoomsChanged`.
 */
export function beforeJoin({
	tournamentId,
	userId,
}: {
	tournamentId: number;
	userId: number;
}): Promise<number[]> {
	return TournamentLFGRepository.leaveLfg({ userId, tournamentId });
}

/**
 * Call after users were written onto a registered tournament team: drops the tournament from their saved events,
 * shows it as theirs on the front page, refreshes its team counts and the pending check-in cache (registration and
 * check-in windows overlap) and, when someone else added them, sends them a `TO_ADDED_TO_TEAM` notification.
 */
export async function afterJoined({
	tournament,
	userIds,
	addedBy,
}: {
	tournament: Tournament;
	userIds: number[];
	/** Set when someone else put the users on the team (not for an organizer creating a new team, or a LFG merge which notifies of its own). */
	addedBy?: {
		username: string;
		team: { id: number; name: string; logoUrl?: string | null };
	};
}) {
	if (userIds.length === 0) return;

	const tournamentId = tournament.ctx.id;

	for (const userId of userIds) {
		await SavedCalendarEventRepository.unsaveByUserId({ userId, tournamentId });

		ShowcaseTournaments.addToCached({
			tournamentId,
			type: "participant",
			userId,
		});
	}
	await ShowcaseTournaments.refreshCachedTournamentCounts(tournamentId);

	PendingCheckIns.clearCache();

	if (addedBy && !tournament.isTest && !tournament.isDraft) {
		notify({
			userIds,
			notification: {
				type: "TO_ADDED_TO_TEAM",
				pictureUrl: addedBy.team.logoUrl ?? tournament.ctx.logoUrl,
				meta: {
					adderUsername: addedBy.username,
					teamName: addedBy.team.name,
					tournamentId,
					tournamentName: tournament.ctx.name,
					tournamentTeamId: addedBy.team.id,
				},
			},
		});
	}
}
