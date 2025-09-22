import { command } from '$app/server';
import { id } from '$lib/utils/zod';
import z from 'zod';
import { requireUser } from '$lib/server/auth/session';
import * as TournamentAPI from '$lib/api/tournament';
import { badRequest } from '$lib/server/remote-functions';
import * as ShowcaseTournaments from '$lib/core/tournament/ShowcaseTournament.server';
import * as TournamentTeamRepository from '$lib/server/db/repositories/tournament-team';
import { error } from '@sveltejs/kit';

export const removeMember = command(
	z.object({
		tournamentId: id,
		userId: id
	}),
	async ({ tournamentId, userId }) => {
		const user = await requireUser();
		const registration = await TournamentAPI.queries.myRegistrationById(tournamentId);

		if (!registration.tournamentTeamId) {
			badRequest("You don't have a team");
		}
		if (!registration.canChangeRegistration) {
			badRequest("Can't change registration at this time");
		}
		if (userId === user.id) {
			badRequest("Can't remove yourself");
		}
		if (!registration.members?.some((member) => member.userId === userId)) {
			badRequest('User is not in your team');
		}
		if (registration.checkedIn && registration.members.length <= registration.minMembers) {
			badRequest(
				"Can't kick member when it would put you under the minimum roster size after checking in"
			);
		}

		await TournamentTeamRepository.deleteMember({
			tournamentTeamId: registration.tournamentTeamId,
			userId
		});

		ShowcaseTournaments.removeFromCached({
			tournamentId,
			type: 'participant',
			userId
		});

		TournamentAPI.queries.myRegistrationById(tournamentId).refresh();
	}
);

export const resetInviteCode = command(id, async (tournamentId) => {
	const registration = await TournamentAPI.queries.myRegistrationById(tournamentId);

	if (!registration.tournamentTeamId) badRequest("You don't have a team");
	if (!registration.isTeamManager) error(403);

	await TournamentTeamRepository.resetInviteCode(registration.tournamentTeamId);

	TournamentAPI.queries.myRegistrationById(tournamentId).refresh();
});
