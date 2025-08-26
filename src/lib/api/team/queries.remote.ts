import { query } from '$app/server';
import { requireUser } from '$lib/server/auth/session';
import * as TeamRepository from '$lib/server/db/repositories/team';
import { teamSlug, type EditTeamData } from './schemas';
import { notFoundIfFalsy } from '$lib/server/remote-functions';
import { canAddCustomizedColors } from '$lib/core/team';
import { requirePermission } from '$lib/modules/permissions/guards.server';

export const canCreateTeam = query(async () => {
	const user = await requireUser();

	const teams = await TeamRepository.findAllUndisbanded();

	const currentTeamCount = teams.filter((team) =>
		team.members.some((member) => member.id === user.id)
	).length;
	const maxTeamCount = user.roles.includes('SUPPORTER') ? 5 : 2;

	return currentTeamCount < maxTeamCount;
});

export const bySlug = query(teamSlug, async (slug) => {
	const team = notFoundIfFalsy(await TeamRepository.findBySlug(slug));

	const results = await TeamRepository.findResultPlacementsById(team.id);

	return {
		team,
		css: canAddCustomizedColors(team) ? team.css : null,
		results: resultsMapped(results)
	};
});

function resultsMapped(results: TeamRepository.FindResultPlacementsById) {
	if (results.length === 0) {
		return null;
	}

	const firstPlaceResults = results.filter((result) => result.placement === 1);
	const secondPlaceResults = results.filter((result) => result.placement === 2);
	const thirdPlaceResults = results.filter((result) => result.placement === 3);

	return {
		count: results.length,
		placements: [
			{
				placement: 1,
				count: firstPlaceResults.length
			},
			{
				placement: 2,
				count: secondPlaceResults.length
			},
			{
				placement: 3,
				count: thirdPlaceResults.length
			}
		]
	};
}

export type BySlugData = Awaited<ReturnType<typeof bySlug>>;

export const resultsBySlug = query(teamSlug, async (slug) => {
	const team = notFoundIfFalsy(await TeamRepository.findBySlug(slug));
	const results = await TeamRepository.findResultsById(team.id);

	return {
		results
	};
});

export const editTeamFormData = query(teamSlug, async (slug): Promise<EditTeamData> => {
	const team = notFoundIfFalsy(await TeamRepository.findBySlug(slug));

	requirePermission(team, 'EDIT');

	return {
		slug: team.customUrl,
		name: team.name,
		bio: team.bio,
		bsky: team.bsky
	};
});
