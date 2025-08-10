import { query } from '$app/server';
import { z } from 'zod/v4';
import * as R from 'remeda';
import type { UserWithPlusTier } from '$lib/server/db/tables';
import * as UserRepository from '$lib/server/db/repositories/user';
import * as TeamRepository from '$lib/server/db/repositories/team';
import { getUser } from '$lib/server/auth/session';
import { queryToUserIdentifier } from '$lib/utils/users';
import { searchUsersSchema } from './schemas';

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

function membersToCommonPlusTierRating(members: Pick<UserWithPlusTier, 'plusTier'>[]) {
	return R.sum(
		members
			.map((m) => m.plusTier ?? 100)
			.sort((a, b) => a - b)
			.slice(0, 4)
	);
}

export const searchUsers = query(searchUsersSchema, async ({ input, limit }) => {
	if (process.env.NODE_ENV === 'production' && !(await getUser())) return null;

	const identifier = queryToUserIdentifier(input);

	return {
		users: identifier
			? await UserRepository.searchExact(identifier)
			: await UserRepository.search({ query: input, limit }),
		input
	};
});
