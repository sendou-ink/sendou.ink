import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as Engine from "~/features/tournament-bracket/core/engine";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import { logger } from "~/utils/logger";
import { errorToast, errorToastIfFalsy } from "~/utils/remix.server";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "../leaderboards/leaderboards-constants";
import type { Tournament } from "../tournament-bracket/core/Tournament";

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
 * Whether the given team name is already used by another team in the tournament.
 * Single source of truth for the uniqueness rule shared by the player registration
 * ({@link registerTeamFormSchemaServer}) and admin registration
 * ({@link adminRegistrationFormSchemaServer}) forms.
 *
 * @param exceptTournamentTeamId - the team being edited, excluded from the comparison
 */
export function tournamentTeamNameTaken({
	tournament,
	name,
	exceptTournamentTeamId,
}: {
	tournament: Tournament;
	name: string;
	exceptTournamentTeamId?: number;
}) {
	return tournament.ctx.teams.some(
		(team) => team.name === name && team.id !== exceptTournamentTeamId,
	);
}

export async function requireSendouQParticipationIfNeeded({
	tournament,
	userId,
}: {
	tournament: Tournament;
	userId: number;
}) {
	if (!tournament.ctx.settings.requireSendouQParticipation) return;

	const hasEnough = await LeaderboardRepository.userHasEnoughSqMatches(userId);

	errorToastIfFalsy(
		hasEnough,
		`Must have played ${MATCHES_COUNT_NEEDED_FOR_LEADERBOARD} SendouQ matches this season to join`,
	);
}

/**
 * Ends all unfinished matches involving dropped teams by awarding wins to their opponents.
 * If both teams in a match have dropped, a random winner is selected. Pure over the given
 * bracket data — the caller persists the returned changedMatches.
 *
 * @param tournament - The tournament instance
 * @param data - The bracket data to end matches in (fresh rows or the previous engine result)
 * @param droppedTeamId - Optional team ID to filter matches for a specific dropped team.
 *                        If omitted, processes all matches with any dropped team.
 */
export function endDroppedTeamMatches({
	tournament,
	data,
	droppedTeamId,
}: {
	tournament: Tournament;
	data: Engine.BracketData;
	droppedTeamId?: number;
}) {
	const droppedTeamIds = tournament.ctx.teams
		.filter((team) => team.droppedOut)
		.map((team) => team.id);
	if (typeof droppedTeamId === "number") droppedTeamIds.push(droppedTeamId);

	const result = Engine.endDroppedTeamMatches(data, droppedTeamIds);

	// xxx: maybe move to caller? or repository function
	for (const matchId of result.endedMatchIds) {
		logger.info(
			`Ending match with dropped team: Match ID: ${matchId}; Dropped team ids: ${droppedTeamIds.join(", ")}`,
		);
	}

	return result;
}
