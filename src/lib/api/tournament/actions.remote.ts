import { badRequest, validatedForm } from '$lib/server/remote-functions';
import * as TournamentTeamRepository from '$lib/server/db/repositories/tournament-team';
import { upsertTeamSchema } from './schemas';
import { requireTournament } from './utils.server';
import * as TeamRepository from '$lib/server/db/repositories/team';
import type { TournamentCore } from '$lib/core/tournament/tournament-core';
import * as TournamentOrganizationRepository from '$lib/server/db/repositories/tournament-organization';
import * as UserAPI from '$lib/api/user';
import * as UserRepository from '$lib/server/db/repositories/user';
import invariant from '$lib/utils/invariant';
import * as ShowcaseTournaments from '$lib/core/tournament/ShowcaseTournament.server';
import { m } from '$lib/paraglide/messages';

export const registerNewTeam = validatedForm(upsertTeamSchema, async (data, user) => {
	const tournament = await requireTournament(data.tournamentId);
	const ownTeam = tournament.teamMemberOfByUser(user);

	if (
		tournament.ctx.teams.some(
			(team) => team.name === data.pickupName && (!ownTeam || team.id !== ownTeam.id)
		)
	) {
		return {
			errors: {
				pickupName: m.wise_icy_cougar_tend
			}
		};
	}

	if (ownTeam) badRequest('You are already in a team for this tournament');

	const team = data.teamId
		? (await TeamRepository.findAllMemberOfByUserId(user.id)).find(
				(team) => team.id === data.teamId
			)
		: null;
	if (data.teamId && !team) {
		badRequest('Team id does not match any of the teams you are in');
	}

	await requireNotBannedByOrganization({
		tournament,
		user
	});

	if (tournament.isInvitational) badRequest('Event is invite only');
	if (!tournament.registrationOpen) badRequest('Registration is closed');
	if (!(await UserAPI.queries.myFriendCode())) {
		badRequest('No friend code');
	}

	const teamName = team?.name ?? data.pickupName;
	invariant(teamName); // checked by schema

	await TournamentTeamRepository.create({
		ownerInGameName: await inGameNameIfNeeded({
			tournament,
			userId: user.id
		}),
		team: {
			name: teamName,
			teamId: data.teamId ?? null
		},
		userId: user.id,
		tournamentId: tournament.ctx.id,
		avatarImgId: data.avatar
	});

	ShowcaseTournaments.addToCached({
		tournamentId: tournament.ctx.id,
		type: 'participant',
		userId: user.id,
		newTeamCount: tournament.ctx.teams.length + 1
	});
});

async function requireNotBannedByOrganization({
	tournament,
	user,
	message = 'You are banned from events hosted by this organization'
}: {
	tournament: TournamentCore;
	user: { id: number };
	message?: string;
}) {
	if (!tournament.ctx.organization) return;

	const isBanned = await TournamentOrganizationRepository.isUserBannedByOrganization({
		organizationId: tournament.ctx.organization.id,
		userId: user.id
	});

	if (isBanned) {
		badRequest(message);
	}
}
async function inGameNameIfNeeded({
	tournament,
	userId
}: {
	tournament: TournamentCore;
	userId: number;
}) {
	if (!tournament.ctx.settings.requireInGameNames) return null;

	const inGameName = await UserRepository.inGameNameByUserId(userId);

	if (!inGameName) badRequest('No in-game name');

	return inGameName;
}
