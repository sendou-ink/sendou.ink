import { query } from '$app/server';
import { requireUser } from '$lib/server/auth/session';
import * as TeamRepository from '$lib/server/db/repositories/team';

export const canCreateTeam = query(async () => {
	const user = await requireUser();

	const teams = await TeamRepository.findAllUndisbanded();

	const currentTeamCount = teams.filter((team) =>
		team.members.some((member) => member.id === user.id)
	).length;
	const maxTeamCount = user.roles.includes('SUPPORTER') ? 5 : 2;

	return currentTeamCount < maxTeamCount;
});
