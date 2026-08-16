import cachified from "@epic-web/cachified";
import * as R from "remeda";
import type { ShowcaseCalendarEvent } from "#lib/features/calendar/calendar-types.ts";
import * as TournamentRepository from "#lib/features/tournament/TournamentRepository.server.ts";
import { tournamentIsRanked } from "#lib/features/tournament/tournament-utils.ts";
import { getTentativeTier } from "#lib/features/tournament-organization/tentativeTiers.server.ts";
import { cache, IN_MILLISECONDS, ttl } from "#lib/server/cache.ts";
import type { CommonUser } from "#lib/server/kysely.ts";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "#lib/utils/dates.ts";
import { tournamentPage } from "#lib/utils/urls.ts";

/**
 * Port note: `firstPlacers` entries skip the React app's Progression-based
 * division labeling (the sidebar path only cares whether a tournament has
 * results at all); the full shape returns with the front-page migration.
 */

interface ShowcaseTournamentCollection {
	participatingFor: ShowcaseCalendarEvent[];
	organizingFor: ShowcaseCalendarEvent[];
	showcase: ShowcaseCalendarEvent[];
	results: ShowcaseCalendarEvent[];
}

interface ParticipationInfo {
	participants: Set<ShowcaseCalendarEvent["id"]>;
	organizers: Set<ShowcaseCalendarEvent["id"]>;
}

export async function upcomingTournaments(): Promise<ShowcaseCalendarEvent[]> {
	const tournaments = await cachedTournaments();
	return tournaments.upcoming;
}

export async function categorizedTournamentsByUserId(
	userId: number | null,
): Promise<ShowcaseTournamentCollection> {
	const tournaments = await cachedTournaments();
	const participation = await cachedParticipationInfo(
		userId,
		tournaments.upcoming,
	);

	return {
		organizingFor: tournaments.upcoming.filter((tournament) =>
			participation.organizers.has(tournament.id),
		),
		participatingFor: tournaments.upcoming.filter(
			(tournament) =>
				!tournament.hidden && participation.participants.has(tournament.id),
		),
		showcase: resolveShowcaseTournaments(
			tournaments.upcoming.filter(
				(tournament) =>
					!tournament.hidden &&
					!participation.organizers.has(tournament.id) &&
					!participation.participants.has(tournament.id),
			),
		),
		results: tournaments.results,
	};
}

let participationInfoMap: Map<CommonUser["id"], ParticipationInfo> | null =
	null;

const emptyParticipationInfo = (): ParticipationInfo => ({
	participants: new Set(),
	organizers: new Set(),
});

export function clearParticipationInfoMap() {
	participationInfoMap = null;
}

async function cachedParticipationInfo(
	userId: number | null,
	tournaments: ShowcaseCalendarEvent[],
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

const SHOWCASE_TOURNAMENTS_CACHE_KEY = "front-tournaments-list";

export const clearCachedTournaments = () =>
	cache.delete(SHOWCASE_TOURNAMENTS_CACHE_KEY);

async function cachedTournaments() {
	return cachified({
		key: SHOWCASE_TOURNAMENTS_CACHE_KEY,
		cache,
		ttl: ttl(IN_MILLISECONDS.TWO_HOURS),
		async getFreshValue() {
			const tournaments = await TournamentRepository.findAllForShowcase();
			const mapped = await Promise.all(tournaments.map(mapTournamentFromDB));

			return deleteExtraResults(mapped);
		},
	});
}

function deleteExtraResults(tournaments: ShowcaseCalendarEvent[]) {
	const threeDaysAgo = databaseTimestampThreeDaysAgo();
	const nonResults = tournaments.filter(
		(tournament) =>
			tournament.firstPlacers.length === 0 &&
			!tournament.isFinalized &&
			tournament.startsAt > threeDaysAgo,
	);

	const rankedResults = tournaments
		.filter(
			(tournament) => tournament.firstPlacers.length > 0 && tournament.isRanked,
		)
		.sort((a, b) => showcaseScore(b) - showcaseScore(a));
	const nonRankedResults = tournaments
		.filter(
			(tournament) =>
				tournament.firstPlacers.length > 0 && !tournament.isRanked,
		)
		.sort((a, b) => showcaseScore(b) - showcaseScore(a));

	const rankedResultsToKeep = rankedResults.slice(0, 4);
	// min 2, max 6 non ranked results
	const nonRankedResultsToKeep = nonRankedResults.slice(
		0,
		6 - rankedResultsToKeep.length,
	);

	return {
		results: [...rankedResultsToKeep, ...nonRankedResultsToKeep].sort(
			(a, b) => b.startsAt - a.startsAt,
		),
		upcoming: nonResults,
	};
}

function resolveShowcaseTournaments(
	tournaments: ShowcaseCalendarEvent[],
): ShowcaseCalendarEvent[] {
	const happeningDuringNextWeek = tournaments.filter(
		(tournament) =>
			tournament.startsAt > databaseTimestampSixHoursAgo() &&
			tournament.startsAt < databaseTimestampWeekFromNow(),
	);
	const sorted = happeningDuringNextWeek.sort(
		(a, b) => b.teamsCount - a.teamsCount,
	);

	const ranked = sorted.filter((tournament) => tournament.isRanked).slice(0, 3);
	// min 3, max 6 non ranked
	const nonRanked = sorted
		.filter((tournament) => !tournament.isRanked)
		.slice(0, 6 - ranked.length);

	return [...ranked, ...nonRanked].sort((a, b) => a.startsAt - b.startsAt);
}

async function tournamentsToParticipationInfoMap(
	tournaments: ShowcaseCalendarEvent[],
): Promise<Map<CommonUser["id"], ParticipationInfo>> {
	const tournamentIds = tournaments.map((tournament) => tournament.id);
	if (tournamentIds.length === 0) return new Map();

	const tournamentsWithUsers =
		await TournamentRepository.findRelatedUsersByTournamentIds(tournamentIds);

	const result: Map<CommonUser["id"], ParticipationInfo> = new Map();

	const addToMap = (
		userId: number,
		tournamentId: number,
		type: "participant" | "organizer",
	) => {
		const participation = result.get(userId) ?? emptyParticipationInfo();

		if (type === "participant") {
			participation.participants.add(tournamentId);
		} else if (type === "organizer") {
			participation.organizers.add(tournamentId);
		}

		result.set(userId, participation);
	};

	for (const tournament of tournamentsWithUsers) {
		for (const { userId } of tournament.teamMembers) {
			addToMap(userId, tournament.id, "participant");
		}

		for (const { userId } of tournament.staff) {
			addToMap(userId, tournament.id, "organizer");
		}

		addToMap(tournament.authorId, tournament.id, "organizer");
	}

	return result;
}

const MEMBERS_TO_SHOW = 5;

async function mapTournamentFromDB(
	tournament: TournamentRepository.ForShowcase,
): Promise<ShowcaseCalendarEvent> {
	const firstPlacers = resolveFirstPlacers(tournament);

	const tentativeTier =
		tournament.tier === null &&
		tournament.organizationId !== null &&
		!tournament.firstPlacers.length
			? await getTentativeTier(tournament.organizationId, tournament.name)
			: null;

	return {
		type: "showcase",
		url: tournamentPage(tournament.id),
		id: tournament.id,
		authorId: tournament.authorId,
		organizationId: tournament.organizationId,
		name: tournament.name,
		startsAt: tournament.startsAt,
		teamsCount: tournament.teamsCount,
		membersCount: tournament.membersCount,
		logoUrl: tournament.logoUrl,
		organization: tournament.organization
			? {
					name: tournament.organization.name,
					slug: tournament.organization.slug,
				}
			: null,
		isRanked: tournamentIsRanked({
			isSetAsRanked: tournament.settings.isRanked,
			startsAt: databaseTimestampToDate(tournament.startsAt),
			minMembersPerTeam: tournament.settings.minMembersPerTeam ?? 4,
			isTest: tournament.settings.isTest ?? false,
		}),
		tier: tournament.tier ?? null,
		tentativeTier,
		hidden: Boolean(tournament.hidden),
		isFinalized: Boolean(tournament.isFinalized),
		minMembersPerTeam: tournament.settings.minMembersPerTeam ?? 4,
		modes: null,
		hasVods: (tournament.vodCount ?? 0) > 0,
		firstPlacers,
	};
}

type FirstPlacerRow = TournamentRepository.ForShowcase["firstPlacers"][number];

function resolveFirstPlacers(
	tournament: TournamentRepository.ForShowcase,
): ShowcaseCalendarEvent["firstPlacers"] {
	if (tournament.firstPlacers.length === 0) {
		return [];
	}

	if (tournament.firstPlacers.every((p) => p.div === null)) {
		return [
			buildFirstPlacerEntry(tournament.firstPlacers, { withMembers: true }),
		];
	}

	const byDiv = R.groupBy(tournament.firstPlacers, (p) => p.div ?? "");
	return Object.values(byDiv)
		.map((rows) => buildFirstPlacerEntry(rows, { withMembers: false }))
		.sort((a, b) => (a.div ?? "").localeCompare(b.div ?? ""));
}

function buildFirstPlacerEntry(
	rows: FirstPlacerRow[],
	{ withMembers }: { withMembers: boolean },
): ShowcaseCalendarEvent["firstPlacers"][number] {
	const first = rows[0];
	const members = withMembers
		? rows.slice(0, MEMBERS_TO_SHOW).map((row) => ({
				customUrl: row.customUrl,
				customAvatarUrl: row.customAvatarUrl,
				discordAvatar: row.discordAvatar,
				discordId: row.discordId,
				id: row.id,
				username: row.username,
				country: row.country,
			}))
		: [];

	return {
		teamName: first.teamName,
		logoUrl: first.teamLogoUrl ?? first.pickupAvatarUrl,
		div: first.div,
		members,
		notShownMembersCount:
			withMembers && rows.length > MEMBERS_TO_SHOW
				? rows.length - MEMBERS_TO_SHOW
				: 0,
	};
}

function databaseTimestampWeekFromNow() {
	const now = new Date();

	now.setDate(now.getDate() + 7);

	return dateToDatabaseTimestamp(now);
}

function databaseTimestampThreeDaysAgo() {
	const now = new Date();

	now.setDate(now.getDate() - 3);

	return dateToDatabaseTimestamp(now);
}

function databaseTimestampSixHoursAgo() {
	const now = new Date();

	now.setHours(now.getHours() - 6);

	return dateToDatabaseTimestamp(now);
}

const TIER_BONUS_PER_STEP = 5;
function showcaseScore(tournament: ShowcaseCalendarEvent): number {
	const tierBonus =
		typeof tournament.tier === "number"
			? (10 - tournament.tier) * TIER_BONUS_PER_STEP
			: 0;

	return tournament.teamsCount + tierBonus;
}
