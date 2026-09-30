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
	if (await isBannedByOrganization({ tournament, userId: user.id })) {
		errorToast(message);
	}
}

/** Whether the user is banned by the organization hosting the tournament (`false` if the tournament has no organization). */
export async function isBannedByOrganization({
	tournament,
	userId,
}: {
	tournament: Tournament;
	userId: number;
}) {
	if (!tournament.ctx.organization) return false;

	return TournamentOrganizationRepository.isUserBannedByOrganization({
		organizationId: tournament.ctx.organization.id,
		userId,
	});
}

/**
 * Whether another team in the tournament already uses the name, shared by the player and admin
 * registration forms. `exceptTournamentTeamId` is the team being edited.
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
	errorToastIfFalsy(
		await fulfillsSendouQParticipation({ tournament, userId }),
		`Must have played ${MATCHES_COUNT_NEEDED_FOR_LEADERBOARD} SendouQ matches this season to join`,
	);
}

/** Whether the user fulfills the tournament's SendouQ participation requirement (`true` if the tournament has none). */
export async function fulfillsSendouQParticipation({
	tournament,
	userId,
}: {
	tournament: Tournament;
	userId: number;
}) {
	if (!tournament.ctx.settings.requireSendouQParticipation) return true;

	return LeaderboardRepository.hasEnoughSqMatchesByUserId(userId);
}

/**
 * Ends unfinished matches of dropped teams (of `droppedTeamId` only when given) by awarding the
 * opponent the win, random when both dropped. Pure over `data` — the caller persists changedMatches.
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

	for (const matchId of result.endedMatchIds) {
		logger.info(
			`Ending match with dropped team: Match ID: ${matchId}; Dropped team ids: ${droppedTeamIds.join(", ")}`,
		);
	}

	return result;
}
