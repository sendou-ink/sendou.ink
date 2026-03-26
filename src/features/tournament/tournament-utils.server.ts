import type { getServerTournamentManager } from "~/features/tournament-bracket/core/brackets-manager/manager.server";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { logger } from "~/utils/logger";
import { errorToast, errorToastIfFalsy } from "~/utils/remix.server";
import type { Tournament } from "../tournament-bracket/core/Tournament";

export const inGameNameIfNeeded = async ({
	tournament,
	userId,
}: {
	tournament: Tournament;
	userId: number;
}) => {
	if (!tournament.ctx.settings.requireInGameNames) return null;

	const inGameName = await UserRepository.inGameNameByUserId(userId);

	errorToastIfFalsy(inGameName, "No in-game name");

	return inGameName;
};

export async function requireNotBannedByOrganization({
	tournament,
	user,
	message = "You are banned from events hosted by this organization",
}: {
	tournament: Tournament;
	user: { id: number };
	message?: string;
}) {
	if (!tournament.ctx.organization) return;

	const isBanned =
		await TournamentOrganizationRepository.isUserBannedByOrganization({
			organizationId: tournament.ctx.organization.id,
			userId: user.id,
		});

	if (isBanned) {
		errorToast(message);
	}
}

/**
 * Ends all unfinished matches involving dropped teams by awarding wins to their opponents.
 * If both teams in a match have dropped, a random winner is selected.
 *
 * @param tournament - The tournament instance
 * @param manager - The bracket manager instance used to update matches
 * @param droppedTeamId - Optional team ID to filter matches for a specific dropped team.
 *                        If omitted, processes all matches with any dropped team.
 */
export function endDroppedTeamMatches({
	tournament,
	manager,
	droppedTeamId,
}: {
	tournament: Tournament;
	manager: ReturnType<typeof getServerTournamentManager>;
	droppedTeamId?: number;
}) {
	const stageData = manager.get.tournamentData(tournament.ctx.id);

	for (const match of stageData.match) {
		if (!match.opponent1?.id || !match.opponent2?.id) continue;
		if (match.opponent1.result === "win" || match.opponent2.result === "win")
			continue;

		const team1 = tournament.teamById(match.opponent1.id);
		const team2 = tournament.teamById(match.opponent2.id);

		const team1Dropped =
			team1?.droppedOut || match.opponent1.id === droppedTeamId;
		const team2Dropped =
			team2?.droppedOut || match.opponent2.id === droppedTeamId;

		if (!team1Dropped && !team2Dropped) continue;

		const winnerTeamId = (() => {
			if (team1Dropped && !team2Dropped) return match.opponent2.id;
			if (!team1Dropped && team2Dropped) return match.opponent1.id;
			return Math.random() < 0.5 ? match.opponent1.id : match.opponent2.id;
		})();

		logger.info(
			`Ending match with dropped team: Match ID: ${match.id}; Team1 dropped: ${team1Dropped}; Team2 dropped: ${team2Dropped}; Winner: ${winnerTeamId}`,
		);

		manager.update.match(
			{
				id: match.id,
				opponent1: {
					result: winnerTeamId === match.opponent1.id ? "win" : "loss",
				},
				opponent2: {
					result: winnerTeamId === match.opponent2.id ? "win" : "loss",
				},
			},
			true,
		);
	}
}
