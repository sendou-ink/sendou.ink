import { query } from '$app/server';
import { getUser } from '$lib/server/auth/session';
import { notFoundIfFalsy } from '$lib/server/remote-functions';
import { id } from '$lib/utils/zod';
import { add, sub } from 'date-fns';
import { requireTournament } from './utils.server';
import markdownit from 'markdown-it';
import { databaseTimestampToDate } from '$lib/utils/dates';

const md = markdownit();

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

export const infoById = query(id, async (id) => {
	const tournament = await requireTournament(id);

	const dayTwoStartsAtTimestamp = tournament.ctx.settings.bracketProgression.find(
		(bracket) =>
			bracket.startTime &&
			databaseTimestampToDate(bracket.startTime) > add(tournament.ctx.startTime, { hours: 12 })
	)?.startTime;

	return {
		name: tournament.ctx.name,
		logoSrc: tournament.ctx.logoSrc,
		description: tournament.ctx.description ? md.render(tournament.ctx.description) : null,
		organization: tournament.ctx.organization
			? {
					name: tournament.ctx.organization.name,
					slug: tournament.ctx.organization.slug,
					avatarUrl: tournament.ctx.organization.avatarUrl
				}
			: null,
		times: {
			registrationEndsAt: tournament.ctx.settings.regClosesAt
				? databaseTimestampToDate(tournament.ctx.settings.regClosesAt)
				: tournament.ctx.startTime,
			checkinStartsAt: sub(tournament.ctx.startTime, { hours: 1 }),
			startsAt: tournament.ctx.startTime,
			dayTwoStartsAt: dayTwoStartsAtTimestamp
				? databaseTimestampToDate(dayTwoStartsAtTimestamp)
				: null
		}
	};
});

export const descriptionsById = query(id, async (id) => {
	const description = (await requireTournament(id)).ctx.description;
	return description ? md.render(description) : null;
});

export const rulesById = query(id, async (id) => {
	const rules = notFoundIfFalsy((await requireTournament(id)).ctx.rules);
	return md.render(rules);
});
