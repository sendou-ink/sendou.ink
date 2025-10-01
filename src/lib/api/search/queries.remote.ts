import { prerender, query } from '$app/server';
import { z } from 'zod/v4';
import * as UserRepository from '$lib/server/db/repositories/user';
import * as TeamRepository from '$lib/server/db/repositories/team';
import { getUser, requireUser } from '$lib/server/auth/session';
import { queryToUserIdentifier } from '$lib/utils/users';
import { membersToCommonPlusTierRating } from './utils';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import * as TournamentRepository from '$lib/server/db/repositories/tournament';

const DEFAULT_SEARCH_ITEMS_LIMIT = 25;

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
		limit: z.coerce.number().int().min(1).max(25).catch(DEFAULT_SEARCH_ITEMS_LIMIT)
	}),
	async ({ input, limit }) => {
		// allowed in development because needed to impersonate a user
		if (process.env.NODE_ENV === 'production') {
			await requireUser();
		}

		const identifier = queryToUserIdentifier(input);
		const data = identifier
			? await UserRepository.searchExact(identifier)
			: await UserRepository.search({ query: input, limit });

		return [...data];
	}
);

export const searchTournaments = query(z.string().max(100), async (input) => {
	await requireUser();

	return await TournamentRepository.searchByName({
		query: input,
		limit: DEFAULT_SEARCH_ITEMS_LIMIT
	});
});

export type TournamentSearchData = Awaited<ReturnType<typeof searchTournaments>>;
export type AllTeamsData = Awaited<ReturnType<typeof getAllTeams>>;
export type UserSearchData = Awaited<ReturnType<typeof searchUsers>>;

export const redirectToSearchPage = prerender(() => {
	redirect(308, resolve('/search'));
});
