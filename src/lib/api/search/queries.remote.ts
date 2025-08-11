import { query } from '$app/server';
import { z } from 'zod/v4';
import * as UserRepository from '$lib/server/db/repositories/user';
import * as TeamRepository from '$lib/server/db/repositories/team';
import { getUser } from '$lib/server/auth/session';
import { queryToUserIdentifier } from '$lib/utils/users';
import { membersToCommonPlusTierRating } from './utils';

export const getAllTeams = query(z.void(), async () => {
	const user = await getUser();
	const unsortedTeams = await TeamRepository.findAllUndisbanded();

	const teams = unsortedTeams.sort((teamA, teamB) => {
		if (user && teamA.members.some((member) => member.id === user.id)) {
			return -1;
		}

		if (user && teamB.members.some((member) => member.id === user.id)) {
			return 1;
		}

		if (teamA.members.length >= 4 && teamB.members.length < 4) {
			return -1;
		}

		if (teamA.members.length < 4 && teamB.members.length >= 4) {
			return 1;
		}

		const teamAPlusTierRating = membersToCommonPlusTierRating(teamA.members);
		const teamBPlusTierRating = membersToCommonPlusTierRating(teamB.members);

		if (teamAPlusTierRating > teamBPlusTierRating) {
			return 1;
		}

		if (teamAPlusTierRating < teamBPlusTierRating) {
			return -1;
		}

		return 0;
	});

	return {
		teams,
		teamMemberOfCount: user
			? teams.filter((team) => team.members.some((m) => m.id === user.id)).length
			: 0
	};
});

export const searchUsers = query(
	z.object({
		input: z.string().max(100).catch(''),
		limit: z.coerce.number().int().min(1).max(25).catch(25)
	}),
	async ({ input, limit }) => {
		if (process.env.NODE_ENV === 'production' && !(await getUser())) return;

		const identifier = queryToUserIdentifier(input);
		const data = identifier
			? await UserRepository.searchExact(identifier)
			: await UserRepository.search({ query: input, limit });

		return [...data];
	}
);

export type AllTeamsData = Awaited<ReturnType<typeof getAllTeams>>;
export type UserSearchData = Awaited<ReturnType<typeof searchUsers>>;
