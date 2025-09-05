import type { ShowcaseCalendarEvent } from '$lib/core/calendar/types';
import { cache, IN_MILLISECONDS, ttl } from '$lib/utils/cache.server';
import type { CommonUser } from '$lib/utils/kysely.server';
import cachified from '@epic-web/cachified';
import * as TournamentRepository from '$lib/server/db/repositories/tournament';
import { resolve } from '$app/paths';
import { tournamentIsRanked } from '$lib/core/tournament/utils';
import { add, sub } from 'date-fns';

interface ShowcaseTournamentCollection {
	participatingFor: ShowcaseCalendarEvent[];
	organizingFor: ShowcaseCalendarEvent[];
	showcase: ShowcaseCalendarEvent[];
	results: ShowcaseCalendarEvent[];
}

interface ParticipationInfo {
	participants: Set<ShowcaseCalendarEvent['id']>;
	organizers: Set<ShowcaseCalendarEvent['id']>;
}

export async function frontPageTournamentsByUserId(
	userId: number | null
): Promise<ShowcaseTournamentCollection> {
	const tournaments = await cachedTournaments();
	const participation = await cachedParticipationInfo(userId, tournaments.upcoming);

	return {
		organizingFor: tournaments.upcoming.filter((tournament) =>
			participation.organizers.has(tournament.id)
		),
		participatingFor: tournaments.upcoming.filter(
			(tournament) => !tournament.hidden && participation.participants.has(tournament.id)
		),
		showcase: resolveShowcaseTournaments(
			tournaments.upcoming.filter(
				(tournament) =>
					!tournament.hidden &&
					!participation.organizers.has(tournament.id) &&
					!participation.participants.has(tournament.id)
			)
		),
		results: tournaments.results
	};
}

let participationInfoMap: Map<CommonUser['id'], ParticipationInfo> | null = null;

function emptyParticipationInfo(): ParticipationInfo {
	return {
		participants: new Set(),
		organizers: new Set()
	};
}

export function clearParticipationInfoMap() {
	participationInfoMap = null;
}

export function addToCached({
	userId,
	tournamentId,
	type,
	newTeamCount
}: {
	userId: number;
	tournamentId: number;
	type: 'participant' | 'organizer';
	/** If a new team joined, the new total team count for the tournament including the new one */
	newTeamCount?: number;
}) {
	if (!participationInfoMap) return;

	const participation = participationInfoMap.get(userId) ?? emptyParticipationInfo();

	if (type === 'participant') {
		participation.participants.add(tournamentId);
	} else if (type === 'organizer') {
		participation.organizers.add(tournamentId);
	}

	participationInfoMap.set(userId, participation);

	if (typeof newTeamCount === 'number') {
		updateCachedTournamentTeamCount({
			tournamentId,
			newTeamCount
		});
	}
}

export function removeFromCached({
	userId,
	tournamentId,
	type
}: {
	userId: number;
	tournamentId: number;
	type: 'participant' | 'organizer';
}) {
	if (!participationInfoMap) return;

	const participation = participationInfoMap.get(userId);
	if (!participation) return;

	if (type === 'participant') {
		participation.participants.delete(tournamentId);
	} else if (type === 'organizer') {
		participation.organizers.delete(tournamentId);
	}

	participationInfoMap.set(userId, participation);
}

export function updateCachedTournamentTeamCount({
	tournamentId,
	newTeamCount
}: {
	tournamentId: number;
	newTeamCount: number;
}) {
	cachedTournaments().then((tournaments) => {
		const tournament = tournaments.upcoming.find((tournament) => tournament.id === tournamentId);
		if (tournament) {
			tournament.teamsCount = newTeamCount;
		}
	});
}

async function cachedParticipationInfo(
	userId: number | null,
	tournaments: ShowcaseCalendarEvent[]
): Promise<ParticipationInfo> {
	if (!userId) {
		return emptyParticipationInfo();
	}

	if (participationInfoMap) {
		return participationInfoMap.get(userId) ?? emptyParticipationInfo();
	}

	const participation = await tournamentsToParticipationInfoMap(tournaments);
	participationInfoMap = participation;

	return participation.get(userId) ?? emptyParticipationInfo();
}

export const SHOWCASE_TOURNAMENTS_CACHE_KEY = 'front-tournaments-list';

export function clearCachedTournaments() {
	cache.delete(SHOWCASE_TOURNAMENTS_CACHE_KEY);
}

async function cachedTournaments() {
	return cachified({
		key: SHOWCASE_TOURNAMENTS_CACHE_KEY,
		cache,
		ttl: ttl(IN_MILLISECONDS.TWO_HOURS),
		async getFreshValue() {
			const tournaments = await TournamentRepository.forShowcase();

			const mapped = tournaments.map(mapTournamentFromDB);

			return deleteExtraResults(mapped);
		}
	});
}

function deleteExtraResults(tournaments: ShowcaseCalendarEvent[]) {
	const nonResults = tournaments.filter((tournament) => !tournament.firstPlacer);

	const rankedResults = tournaments
		.filter((tournament) => tournament.firstPlacer && tournament.isRanked)
		.sort((a, b) => b.teamsCount - a.teamsCount);
	const nonRankedResults = tournaments
		.filter((tournament) => tournament.firstPlacer && !tournament.isRanked)
		.sort((a, b) => b.teamsCount - a.teamsCount);

	const rankedResultsToKeep = rankedResults.slice(0, 4);
	// min 2, max 6 non ranked results
	const nonRankedResultsToKeep = nonRankedResults.slice(0, 6 - rankedResultsToKeep.length);

	return {
		results: [...rankedResultsToKeep, ...nonRankedResultsToKeep].sort(
			(a, b) => b.startTime.getTime() - a.startTime.getTime()
		),
		upcoming: nonResults
	};
}

function resolveShowcaseTournaments(tournaments: ShowcaseCalendarEvent[]): ShowcaseCalendarEvent[] {
	const happeningDuringNextWeek = tournaments.filter(
		(tournament) =>
			tournament.startTime > sub(new Date(), { hours: 6 }) &&
			tournament.startTime < add(new Date(), { weeks: 1 })
	);
	const sorted = happeningDuringNextWeek.sort((a, b) => b.teamsCount - a.teamsCount);

	const ranked = sorted.filter((tournament) => tournament.isRanked).slice(0, 3);
	// min 3, max 6 non ranked
	const nonRanked = sorted.filter((tournament) => !tournament.isRanked).slice(0, 6 - ranked.length);

	return [...ranked, ...nonRanked].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

async function tournamentsToParticipationInfoMap(
	tournaments: ShowcaseCalendarEvent[]
): Promise<Map<CommonUser['id'], ParticipationInfo>> {
	const tournamentIds = tournaments.map((tournament) => tournament.id);
	const tournamentsWithUsers =
		await TournamentRepository.relatedUsersByTournamentIds(tournamentIds);

	const result: Map<CommonUser['id'], ParticipationInfo> = new Map();

	function addToMap(userId: number, tournamentId: number, type: 'participant' | 'organizer') {
		const participation = result.get(userId) ?? emptyParticipationInfo();

		if (type === 'participant') {
			participation.participants.add(tournamentId);
		} else if (type === 'organizer') {
			participation.organizers.add(tournamentId);
		}

		result.set(userId, participation);
	}

	for (const tournament of tournamentsWithUsers) {
		for (const { userId } of tournament.teamMembers) {
			addToMap(userId, tournament.id, 'participant');
		}

		for (const { userId } of tournament.staff) {
			addToMap(userId, tournament.id, 'organizer');
		}

		for (const { userId } of tournament.organizationMembers) {
			addToMap(userId, tournament.id, 'organizer');
		}

		addToMap(tournament.authorId, tournament.id, 'organizer');
	}

	return result;
}

const MEMBERS_TO_SHOW = 5;

function mapTournamentFromDB(tournament: TournamentRepository.ForShowcase): ShowcaseCalendarEvent {
	return {
		type: 'showcase',
		url: resolve('/to/[id]', { id: String(tournament.id) }),
		id: tournament.id,
		authorId: tournament.authorId,
		name: tournament.name,
		startTime: tournament.startTime,
		teamsCount: tournament.teamsCount,
		logoUrl: tournament.logoUrl,
		organization: tournament.organization
			? {
					name: tournament.organization.name,
					slug: tournament.organization.slug
				}
			: null,
		isRanked: tournamentIsRanked({
			isSetAsRanked: tournament.settings.isRanked,
			startTime: tournament.startTime,
			minMembersPerTeam: tournament.settings.minMembersPerTeam ?? 4,
			isTest: tournament.settings.isTest ?? false
		}),
		hidden: Boolean(tournament.hidden),
		modes: null, // no need to show modes for front page, maybe could in the future?
		firstPlacer:
			tournament.firstPlacers.length > 0
				? {
						teamName: tournament.firstPlacers[0].teamName,
						logoUrl:
							tournament.firstPlacers[0].teamLogoUrl ?? tournament.firstPlacers[0].pickupAvatarUrl,
						members: tournament.firstPlacers.slice(0, MEMBERS_TO_SHOW).map((firstPlacer) => ({
							customUrl: firstPlacer.customUrl,
							discordAvatar: firstPlacer.discordAvatar,
							discordId: firstPlacer.discordId,
							id: firstPlacer.id,
							username: firstPlacer.username,
							country: firstPlacer.country
						})),
						notShownMembersCount:
							tournament.firstPlacers.length > MEMBERS_TO_SHOW
								? tournament.firstPlacers.length - MEMBERS_TO_SHOW
								: 0
					}
				: null
	};
}
