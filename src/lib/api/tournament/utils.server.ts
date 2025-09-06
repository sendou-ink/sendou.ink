import { getRequestEvent } from '$app/server';
import { BracketsManager } from '$lib/core/brackets-manager';
import { SqlDatabase } from '$lib/core/tournament/crud.server';
import { Tournament } from '$lib/core/tournament/Tournament';
import * as TournamentRepository from '$lib/server/db/repositories/tournament';
import { notFoundIfFalsy } from '$lib/server/remote-functions';

export async function requireTournament(tournamentId: number) {
	const { locals } = getRequestEvent();

	if (locals.tournament?.[tournamentId]) {
		return locals.tournament[tournamentId];
	}

	const tournamentPromise = fetchTournament(tournamentId);
	if (!locals.tournament) locals.tournament = {};
	locals.tournament[tournamentId] = tournamentPromise;

	return tournamentPromise;
}

// TODO: fix this ts-expect-error comment
// @ts-expect-error interface mismatch
const manager = new BracketsManager(new SqlDatabase());

// xxx: implement caching, probably via LRU-cache
async function fetchTournament(tournamentId: number) {
	const ctx = notFoundIfFalsy(await TournamentRepository.findById(tournamentId));
	const data = manager.get.tournamentData(tournamentId);

	// xxx: turn simulateBrackets: true?
	return new Tournament({ data, ctx, simulateBrackets: false });
}

export function clearTournamentDataCache(_tournamentId: number) {
	// xxx: todo implement cache clearing
}
