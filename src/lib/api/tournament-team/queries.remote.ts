import { getRequestEvent, query } from '$app/server';
import { id } from '$lib/utils/zod';
import z from 'zod';
import { requireUser } from '$lib/server/auth/session';
import { badRequestIfFalsy } from '$lib/server/remote-functions';
import * as TournamentTeamRepository from '$lib/server/db/repositories/tournament-team';
import { requireNotBannedByOrganization, requireTournament } from '../tournament/utils.server';
import * as UserAPI from '$lib/api/user';
import { err, ok } from 'neverthrow';
import { SHORT_NANOID_LENGTH } from '$lib/utils/id';
import { m } from '$lib/paraglide/messages';
import { extractLocaleFromRequest } from '$lib/paraglide/runtime';

// xxx: translate these
export const validateInviteCode = query(
	z.object({ tournamentId: id, inviteCode: z.string() }),
	async ({ tournamentId, inviteCode }) => {
		const user = await requireUser();
		const tournament = await requireTournament(tournamentId);
		const request = getRequestEvent().request;

		if (inviteCode.length !== SHORT_NANOID_LENGTH) {
			return err(m.team_validation_SHORT_CODE({ locale: extractLocaleFromRequest(request) }));
		}

		await requireNotBannedByOrganization({
			tournament,
			user
		});

		if (!(await UserAPI.queries.myFriendCode())) {
			err('You need a friend code set to join a team');
		}

		// xxx: can we have some database level checks for these too with triggers?

		const teamToJoinId = badRequestIfFalsy(
			await TournamentTeamRepository.findByInviteCode(inviteCode)
		).id;
		const teamToJoin = badRequestIfFalsy(
			tournament.ctx.teams.find((team) => team.id === teamToJoinId)
		);
		const previousTeam = tournament.ctx.teams.find((team) =>
			team.members.some((member) => member.userId === user.id)
		);

		if (previousTeam?.id === teamToJoin.id) {
			err(m.tournament_join_error_ALREADY_JOINED({ locale: extractLocaleFromRequest(request) }));
		}

		if (teamToJoin.members.length >= tournament.maxTeamMemberCount) {
			err(m.tournament_join_error_TEAM_FULL({ locale: extractLocaleFromRequest(request) }));
		}
		if (!tournament.registrationOpen) {
			err('Registration is closed');
		}
		if (tournament.hasStarted && previousTeam && previousTeam.checkIns.length > 0) {
			err("Can't leave checked in team mid tournament");
		}
		if (tournament.hasStarted && !tournament.autonomousSubs) {
			err('Subs are not allowed');
		}

		return ok({ tournamentTeamId: teamToJoin.id });
	}
);
