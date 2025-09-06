import { query } from '$app/server';
import { getUser } from '$lib/server/auth/session';
import { id } from '$lib/utils/zod';
import { requireTournament } from './utils.server';

export const tabsById = query(id, async (id) => {
	return {
		tabs: await tabs(id),
		counts: await tabCounts(id)
	};
});

async function tabs(tournamentId: number) {
	const tournament = await requireTournament(tournamentId);

	return new Set(
		(
			[
				'info',
				'teams',
				tournament.hasStarted || tournament.isLeagueDivision ? 'register' : null,
				tournament.ctx.rules ? 'rules' : null,
				!tournament.isLeagueSignup ? 'brackets' : null,
				tournament.isLeagueSignup || tournament.isLeagueDivision ? 'divisions' : null,
				!tournament.everyBracketOver && tournament.subsFeatureEnabled ? 'subs' : null,
				tournament.hasStarted && !tournament.everyBracketOver ? 'streams' : null,
				tournament.hasStarted ? 'results' : null,
				'admin' // xxx: check perms
			] as const
		).filter((value) => value !== null)
	);
}

async function tabCounts(tournamentId: number) {
	const user = await getUser();
	const tournament = await requireTournament(tournamentId);

	return {
		teams: tournament.ctx.teams.length,
		streams: 5, // xxx: streams count
		subs: tournament.ctx.subCounts.reduce((acc, cur) => {
			if (cur.visibility === 'ALL') return acc + cur.count;

			const userPlusTier = user?.plusTier ?? 4;

			switch (cur.visibility) {
				case 1: {
					return userPlusTier === 1 ? acc + cur.count : acc;
				}
				case 2: {
					return userPlusTier <= 2 ? acc + cur.count : acc;
				}
				case 3: {
					return userPlusTier <= 3 ? acc + cur.count : acc;
				}
				default: {
					throw new Error('Unexpected plus tier');
				}
			}
		}, 0)
	};
}
