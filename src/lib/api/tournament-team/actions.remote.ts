import { command } from '$app/server';
import { id } from '$lib/utils/zod';
import z from 'zod';
import { requireUser } from '$lib/server/auth/session';
import * as TournamentAPI from '$lib/api/tournament';
import { badRequest, badRequestIfErr } from '$lib/server/remote-functions';
import * as ShowcaseTournaments from '$lib/core/tournament/ShowcaseTournament.server';
import * as TournamentTeamRepository from '$lib/server/db/repositories/tournament-team';
import { error } from '@sveltejs/kit';
import {
	clearTournamentDataCache,
	inGameNameIfNeeded,
	requireTournament
} from '../tournament/utils.server';
import { validateInviteCode } from './queries.remote';

export const joinTeam = command(
	z.object({ tournamentId: id, inviteCode: z.string() }),
	async ({ tournamentId, inviteCode }) => {
		const user = await requireUser();
		const tournament = await requireTournament(tournamentId);

		const { tournamentTeamId: teamToJoinId } = badRequestIfErr(
			await validateInviteCode({ tournamentId, inviteCode })
		);
		const previousTeam = tournament.ctx.teams.find((team) =>
			team.members.some((member) => member.userId === user.id)
		);

		const whatToDoWithPreviousTeam = !previousTeam
			? undefined
			: previousTeam.members.some((member) => member.userId === user.id && member.isOwner)
				? 'DELETE'
				: 'LEAVE';

		await TournamentTeamRepository.join({
			userId: user.id,
			newTeamId: teamToJoinId,
			previousTeamId: previousTeam?.id,
			// making sure they aren't unfilling one checking in condition i.e. having full roster
			// and then having members leave without it affecting the checking in status
			checkOutTeam:
				whatToDoWithPreviousTeam === 'LEAVE' &&
				previousTeam &&
				previousTeam.members.length <= tournament.minMembersPerTeam,
			whatToDoWithPreviousTeam,
			tournamentId,
			inGameName: await inGameNameIfNeeded({
				tournament,
				userId: user.id
			})
		});

		ShowcaseTournaments.addToCached({
			tournamentId,
			type: 'participant',
			userId: user.id
		});

		// xxx: add trust giving
		// if (data.trust) {
		// 	const inviterUserId = teamToJoin.members.find((member) => member.isOwner)?.userId;
		// 	invariant(inviterUserId, 'Inviter user could not be resolved');
		// 	giveTrust({
		// 		trustGiverUserId: user.id,
		// 		trustReceiverUserId: inviterUserId
		// 	});
		// }

		clearTournamentDataCache(tournamentId);

		TournamentAPI.queries.myRegistrationById(tournamentId).refresh();
	}
);

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
