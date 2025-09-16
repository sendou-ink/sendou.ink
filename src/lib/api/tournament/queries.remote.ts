import { query } from '$app/server';
import { getUser, requireUser } from '$lib/server/auth/session';
import { notFoundIfFalsy, type SchemaToDefaultValues } from '$lib/server/remote-functions';
import { id } from '$lib/utils/zod';
import { add, sub } from 'date-fns';
import { requireTournament } from './utils.server';
import markdownit from 'markdown-it';
import { databaseTimestampToDate } from '$lib/utils/dates';
import { userSubmittedImage } from '$lib/utils/urls-img';
import type { UpsertTeamData } from './schemas';

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
				!tournament.ctx.isFinalized ? 'register' : null,
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
					return acc; // xxx: throw new Error('Unexpected plus tier'); - add back when plus server seed exists
				}
			}
		}, 0)
	};
}

export type InfoByIdData = Awaited<ReturnType<typeof infoById>>;

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
		author: {
			discordId: tournament.ctx.author.discordId,
			username: tournament.ctx.author.username,
			customUrl: tournament.ctx.author.customUrl,
			discordAvatar: tournament.ctx.author.discordAvatar
		},
		infos: {
			isRanked: tournament.ranked,
			modes: tournament.modesIncluded,
			minMembersPerTeam: tournament.ctx.settings.minMembersPerTeam ?? 4,
			isSkillCapped: tournament.ctx.tags?.includes('LOW')
		},
		organization: tournament.ctx.organization
			? {
					name: tournament.ctx.organization.name,
					slug: tournament.ctx.organization.slug,
					logoSrc: tournament.ctx.organization.avatarUrl
						? userSubmittedImage(tournament.ctx.organization.avatarUrl)
						: null
				}
			: null,
		brackets: tournament.ctx.settings.bracketProgression.map((bracket) => bracket.name),
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

export const myRegistrationByTournamentId = query(id, async (tournamentId) => {
	const user = notFoundIfFalsy(await requireUser());
	const tournament = await requireTournament(tournamentId);

	const team = tournament.ctx.teams.find((team) =>
		team.members.some((member) => member.userId === user.id)
	);

	const teamInfoDefaultValues: SchemaToDefaultValues<UpsertTeamData> | null = team
		? {
				tournamentId: tournament.ctx.id,
				teamId: team.id ?? undefined,
				pickupName: team.id ? null : team.name,
				avatar: undefined
			}
		: null;

	return {
		teamInfoDefaultValues,
		registrationOpen: tournament.registrationOpen
	};
});
