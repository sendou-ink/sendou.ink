import { badRequest, validatedForm } from '$lib/server/remote-functions';
import * as TournamentTeamRepository from '$lib/server/db/repositories/tournament-team';
import { upsertTeamMapPool, upsertTeamSchema } from './schemas';
import { clearTournamentDataCache, requireTournament } from './utils.server';
import * as TeamRepository from '$lib/server/db/repositories/team';
import type { TournamentCore } from '$lib/core/tournament/tournament-core';
import * as TournamentOrganizationRepository from '$lib/server/db/repositories/tournament-organization';
import * as UserAPI from '$lib/api/user';
import * as UserRepository from '$lib/server/db/repositories/user';
import invariant from '$lib/utils/invariant';
import * as ShowcaseTournaments from '$lib/core/tournament/ShowcaseTournament.server';
import { m } from '$lib/paraglide/messages';
import { command } from '$app/server';
import { myRegistrationById } from './queries.remote';
import { id } from '$lib/utils/zod';
import { mapPickingStyleToModes } from '$lib/core/tournament/utils';
import { TOURNAMENT } from '$lib/constants/tournament';

export const registerNewTeam = validatedForm(upsertTeamSchema, async (data, user) => {
	const tournament = await requireTournament(data.tournamentId);
	const ownTeam = tournament.teamMemberOfByUser(user);

	if (ownTeam) badRequest('You are already in a team for this tournament');

	if (tournament.ctx.teams.some((team) => team.name === data.pickupName)) {
		return {
			errors: {
				pickupName: m.wise_icy_cougar_tend
			}
		};
	}

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

	// xxx: use myRegistrationById?
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

	clearTournamentDataCache(data.tournamentId);
	ShowcaseTournaments.addToCached({
		tournamentId: tournament.ctx.id,
		type: 'participant',
		userId: user.id,
		newTeamCount: tournament.ctx.teams.length + 1
	});
	await myRegistrationById(data.tournamentId).refresh();
});

export const updateTeam = validatedForm(upsertTeamSchema, async (data, user) => {
	const registration = await myRegistrationById(data.tournamentId);

	if (!registration.canChangeRegistration) {
		badRequest('You cannot change your registration');
	}
	if (!registration.tournamentTeamId) {
		badRequest('You are not registered to this tournament');
	}

	const team = data.teamId
		? (await TeamRepository.findAllMemberOfByUserId(user.id)).find(
				(team) => team.id === data.teamId
			)
		: null;
	if (data.teamId && !team) {
		badRequest('Team id does not match any of the teams you are in');
	}

	const teamName = team?.name ?? data.pickupName;
	invariant(teamName); // checked by schema

	await TournamentTeamRepository.update(registration.tournamentTeamId, {
		avatarImgId: data.avatar ?? null,
		name: teamName,
		teamId: data.teamId ?? null
	});

	myRegistrationById(data.tournamentId).refresh();
});

export const upsertMapPool = validatedForm(upsertTeamMapPool, async (data) => {
	const registration = await myRegistrationById(data.tournamentId);
	if (!registration.tournamentTeamId) {
		badRequest('You are not registered to this tournament');
	}
	if (!registration.canChangeRegistration) {
		badRequest('You cannot change your registration');
	}

	if (!registration.mapPickingStyle) {
		badRequest('This tournament does not require map pools');
	}

	const mapPool = data[registration.mapPickingStyle];

	if (!mapPool) {
		badRequest('Did not submit map pool');
	}

	for (const mode of mapPickingStyleToModes(registration.mapPickingStyle)) {
		const requiredLength =
			registration.mapPickingStyle === 'AUTO_ALL'
				? TOURNAMENT.COUNTERPICK_MAPS_PER_MODE
				: TOURNAMENT.COUNTERPICK_ONE_MODE_TOURNAMENT_MAPS_PER_MODE;
		if (!mapPool[mode] || mapPool[mode].length !== requiredLength) {
			return {
				errors: {
					[registration.mapPickingStyle]:
						registration.mapPickingStyle === 'AUTO_ALL'
							? // xxx: i18n for these
								'Pick ${requiredLength} maps per mode.'
							: `Pick ${requiredLength} maps.`
				}
			};
		}
	}

	await TournamentTeamRepository.upsertMapPool(registration.tournamentTeamId, {
		mapPool
	});
	myRegistrationById(data.tournamentId).refresh();
});

export const unregisterFromTournament = command(id, async (tournamentId) => {
	const tournament = await requireTournament(tournamentId);
	const registration = await myRegistrationById(tournamentId);

	if (!registration.tournamentTeamId) {
		badRequest('You are not registered to this tournament');
	}
	if (!registration.canChangeRegistration) {
		badRequest('You cannot change your registration');
	}
	if (registration.checkedIn) {
		badRequest('You cannot unregister after checking in');
	}

	await TournamentTeamRepository.deleteById(registration.tournamentTeamId);

	for (const member of registration?.members ?? []) {
		ShowcaseTournaments.removeFromCached({
			tournamentId,
			type: 'participant',
			userId: member.userId
		});
	}

	ShowcaseTournaments.updateCachedTournamentTeamCount({
		tournamentId,
		newTeamCount: tournament.ctx.teams.length - 1
	});

	clearTournamentDataCache(tournamentId);
	myRegistrationById(tournamentId).refresh();
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
