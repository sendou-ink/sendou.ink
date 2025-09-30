import { query } from '$app/server';
import { getUser, requireUser } from '$lib/server/auth/session';
import { notFoundIfFalsy, type SchemaToDefaultValues } from '$lib/server/remote-functions';
import { id } from '$lib/utils/zod';
import { add, sub } from 'date-fns';
import { requireTournament } from './utils.server';
import { databaseTimestampToDate } from '$lib/utils/dates';
import { userSubmittedImage } from '$lib/utils/urls-img';
import type { UpsertTeamData, UpsertTeamMapPoolData } from './schemas';
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import * as MapPool from '$lib/core/maps/MapPool';
import { TOURNAMENT_MAP_PICKING_STYLES } from '$lib/constants/calendar';
import * as Standings from '$lib/core/tournament/Standings';
import { renderMarkdown } from '$lib/utils/markdown.server';

export const redirectToCurrentMainPage = query(id, async (tournamentId) => {
	const tournament = await requireTournament(tournamentId);

	if (tournament.ctx.isFinalized) {
		redirect(307, resolve(`/to/${tournament.ctx.id}/results`));
	}

	if (tournament.regularCheckInHasEnded) {
		redirect(307, resolve(`/to/${tournament.ctx.id}/brackets/0`));
	}

	redirect(307, resolve(`/to/${tournament.ctx.id}/register`));
});

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
		description: tournament.ctx.description ? renderMarkdown(tournament.ctx.description) : null,
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

export const rulesById = query(id, async (id) => {
	const rules = notFoundIfFalsy((await requireTournament(id)).ctx.rules);
	return renderMarkdown(rules);
});

/** User's registration for the specified tournament. Note that before tournament starts each user can only be in one team, but afterwards it's possible to be in many teams (as added by the organizer). */
export const myRegistrationById = query(id, async (tournamentId) => {
	const user = notFoundIfFalsy(await requireUser());
	const tournament = await requireTournament(tournamentId);

	const tournamentTeam = tournament.ctx.teams.find((team) =>
		team.members.some((member) => member.userId === user.id)
	);

	// xxx: extract to different remote function?
	const teamInfoDefaultValues: Partial<SchemaToDefaultValues<UpsertTeamData>> = tournamentTeam
		? {
				tournamentId: tournament.ctx.id,
				// xxx: fix after remote form functions migration lands
				teamId: (tournamentTeam.team?.id ? String(tournamentTeam.team.id) : 'pickup') as any,
				pickupName: tournamentTeam.team ? null : tournamentTeam.name,
				avatar: undefined
			}
		: { tournamentId: tournament.ctx.id };

	const mapPickingStyle =
		tournament.ctx.mapPickingStyle !== 'TO' ? tournament.ctx.mapPickingStyle : null;
	// xxx: extract to different remote function?
	const mapPoolDefaultValues: Partial<SchemaToDefaultValues<UpsertTeamMapPoolData>> = tournamentTeam
		? {
				tournamentId: tournament.ctx.id,
				...Object.fromEntries(
					TOURNAMENT_MAP_PICKING_STYLES.filter((style) => style !== 'TO').map((style) => [
						style,
						mapPickingStyle === style
							? (MapPool.fromArray(tournamentTeam.mapPool) ?? undefined)
							: undefined
					])
				)
			}
		: {};

	const isTeamManager = Boolean(
		tournamentTeam?.members.some((member) => member.userId === user.id && member.isOwner)
	);

	return {
		tournamentTeamId: tournamentTeam?.id ?? null,
		/** Is the team checked in (main check-in for the whole tournament) */
		checkedIn: (tournamentTeam?.checkIns ?? []).length > 0,
		teamInfoDefaultValues,
		mapPoolDefaultValues,
		minMembers: tournament.minMembersPerTeam,
		maxMembers: tournament.maxTeamMemberCount,
		inviteCode: isTeamManager ? (tournamentTeam?.inviteCode ?? null) : null,
		isTeamManager,
		members: tournamentTeam?.members.map((member) => ({
			userId: member.userId,
			discordId: member.discordId,
			customUrl: member.customUrl,
			discordAvatar: member.discordAvatar,
			name: tournament.ctx.settings.requireInGameNames
				? (member.inGameName ?? member.username)
				: member.username
		})),
		registrationClosesAt: tournament.registrationClosesAt,
		/** Do teams need to pick a map pool as part of registration and if so then in which style? */
		mapPickingStyle:
			tournament.ctx.mapPickingStyle !== 'TO' ? tournament.ctx.mapPickingStyle : null,
		/** Is it possible to change registration right now for this user and at this point in time? */
		canChangeRegistration: tournament.registrationOpen && isTeamManager
	};
});

export const teamsById = query(id, async (tournamentId) => {
	const tournament = await requireTournament(tournamentId);

	return tournament.ctx.teams.map((team, i) => ({
		id: team.id,
		seed: i + 1,
		name: team.name,
		logoSrc: tournament.tournamentTeamLogoSrc(team),
		members: team.members.map((member) => {
			return {
				discordId: member.discordId,
				customUrl: member.customUrl,
				discordAvatar: member.discordAvatar,
				isSub: false,
				isInactive: false,
				isOwner: member.isOwner,
				name: tournament.ctx.settings.requireInGameNames
					? (member.inGameName ?? member.username)
					: member.username
			};
		})
	}));
});

export type TeamsByIdData = Awaited<ReturnType<typeof teamsById>>;

export const resultsById = query(id, async (tournamentId) => {
	const tournament = await requireTournament(tournamentId);

	const standings = Standings.tournamentStandings(tournament);

	let lastPlacement = 0;
	return standings.map((standing) => {
		let shouldHavePlacement = false;
		if (standing.placement !== lastPlacement) {
			shouldHavePlacement = true;
			lastPlacement = standing.placement;
		}

		return {
			team: standing.team,
			placement: shouldHavePlacement ? standing.placement : null,
			spr: tournament.ctx.isFinalized
				? Standings.calculateSPR({
						standings,
						teamId: standing.team.id
					})
				: null,
			matches: Standings.matchesPlayed({ tournament, teamId: standing.team.id }),
			teamLogoSrc: tournament.tournamentTeamLogoSrc(standing.team)
		};
	});
});
