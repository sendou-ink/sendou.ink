import cachified from "@epic-web/cachified";
import { ONE_HOUR_IN_MS, TWO_HOURS_IN_MS } from "~/constants";
import type { Tables } from "~/db/tables";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { tournamentIsRanked } from "~/features/tournament/tournament-utils";
import { cache, ttl } from "~/utils/cache.server";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import type { CommonUser } from "~/utils/kysely.server";

interface ShowcaseTournamentCollection {
	participatingFor: ShowcaseTournament[];
	organizingFor: ShowcaseTournament[];
	showcase: ShowcaseTournament[];
	results: ShowcaseTournament[];
}

export interface ShowcaseTournament {
	id: number;
	name: string;
	startTime: number;
	teamsCount: number;
	isRanked: boolean;
	logoUrl: string | null;
	organization: {
		name: string;
		slug: string;
	} | null;
	firstPlacer: {
		teamName: string;
		logoUrl: string | null;
		members: (CommonUser & { country: Tables["User"]["country"] })[];
		notShownMembersCount: number;
	} | null;
}

interface ParticipationInfo {
	participants: Set<ShowcaseTournament["id"]>;
	organizers: Set<ShowcaseTournament["id"]>;
}

export async function frontPageTournamentsByUserId(
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
		participatingFor: tournaments.upcoming.filter((tournament) =>
			participation.participants.has(tournament.id),
		),
		showcase: resolveShowcaseTournaments(
			tournaments.upcoming.filter(
				(tournament) =>
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

export function addToParticipationInfoMap({
	userId,
	tournamentId,
	type,
}: {
	userId: number;
	tournamentId: number;
	type: "participant" | "organizer";
}) {
	if (!participationInfoMap) return;

	const participation =
		participationInfoMap.get(userId) ?? emptyParticipationInfo();

	if (type === "participant") {
		participation.participants.add(tournamentId);
	} else if (type === "organizer") {
		participation.organizers.add(tournamentId);
	}

	participationInfoMap.set(userId, participation);
}

export function removeFromParticipationInfoMap({
	userId,
	tournamentId,
	type,
}: {
	userId: number;
	tournamentId: number;
	type: "participant" | "organizer";
}) {
	if (!participationInfoMap) return;

	const participation = participationInfoMap.get(userId);
	if (!participation) return;

	if (type === "participant") {
		participation.participants.delete(tournamentId);
	} else if (type === "organizer") {
		participation.organizers.delete(tournamentId);
	}

	participationInfoMap.set(userId, participation);
}

async function cachedParticipationInfo(
	userId: number | null,
	tournaments: ShowcaseTournament[],
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

export const SHOWCASE_TOURNAMENTS_CACHE_KEY = "front-tournaments-list";

export const clearCachedTournaments = () =>
	cache.delete(SHOWCASE_TOURNAMENTS_CACHE_KEY);

async function cachedTournaments() {
	return cachified({
		key: SHOWCASE_TOURNAMENTS_CACHE_KEY,
		cache,
		ttl: ttl(ONE_HOUR_IN_MS),
		staleWhileRevalidate: ttl(TWO_HOURS_IN_MS),
		async getFreshValue() {
			const tournaments = await TournamentRepository.forShowcase();

			const mapped = tournaments.map(mapTournamentFromDB);

			return deleteExtraResults(mapped);
		},
	});
}

function deleteExtraResults(tournaments: ShowcaseTournament[]) {
	const nonResults = tournaments.filter(
		(tournament) => !tournament.firstPlacer,
	);

	const rankedResults = tournaments
		.filter((tournament) => tournament.firstPlacer && tournament.isRanked)
		.sort((a, b) => b.teamsCount - a.teamsCount);
	const nonRankedResults = tournaments
		.filter((tournament) => tournament.firstPlacer && !tournament.isRanked)
		.sort((a, b) => b.teamsCount - a.teamsCount);

	const rankedResultsToKeep = rankedResults.slice(0, 4);
	// min 2, max 6 non ranked results
	const nonRankedResultsToKeep = nonRankedResults.slice(
		0,
		6 - rankedResultsToKeep.length,
	);

	return {
		results: [...rankedResultsToKeep, ...nonRankedResultsToKeep].sort(
			(a, b) => b.startTime - a.startTime,
		),
		upcoming: nonResults,
	};
}

function resolveShowcaseTournaments(
	tournaments: ShowcaseTournament[],
): ShowcaseTournament[] {
	const happeningDuringNextWeek = tournaments.filter(
		(tournament) =>
			tournament.startTime > databaseTimestampSixHoursAgo() &&
			tournament.startTime < databaseTimestampWeekFromNow(),
	);
	const sorted = happeningDuringNextWeek.sort(
		(a, b) => b.teamsCount - a.teamsCount,
	);

	const ranked = sorted.filter((tournament) => tournament.isRanked).slice(0, 3);
	// min 3, max 6 non ranked
	const nonRanked = sorted
		.filter((tournament) => !tournament.isRanked)
		.slice(0, 6 - ranked.length);

	return [...ranked, ...nonRanked].sort((a, b) => a.startTime - b.startTime);
}

async function tournamentsToParticipationInfoMap(
	tournaments: ShowcaseTournament[],
): Promise<Map<CommonUser["id"], ParticipationInfo>> {
	const tournamentIds = tournaments.map((tournament) => tournament.id);
	const tournamentsWithUsers =
		await TournamentRepository.relatedUsersByTournamentIds(tournamentIds);

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

		for (const { userId } of tournament.organizationMembers) {
			addToMap(userId, tournament.id, "organizer");
		}

		addToMap(tournament.authorId, tournament.id, "organizer");
	}

	return result;
}

const MEMBERS_TO_SHOW = 5;

function mapTournamentFromDB(
	tournament: TournamentRepository.ForShowcase,
): ShowcaseTournament {
	return {
		id: tournament.id,
		name: tournament.name,
		startTime: tournament.startTime,
		teamsCount: tournament.teamsCount,
		logoUrl: tournament.logoUrl,
		organization: tournament.organization
			? {
					name: tournament.organization.name,
					slug: tournament.organization.slug,
				}
			: null,
		isRanked: tournamentIsRanked({
			isSetAsRanked: tournament.settings.isRanked,
			startTime: databaseTimestampToDate(tournament.startTime),
			minMembersPerTeam: tournament.settings.minMembersPerTeam ?? 4,
		}),
		firstPlacer:
			tournament.firstPlacers.length > 0
				? {
						teamName: tournament.firstPlacers[0].teamName,
						logoUrl:
							tournament.firstPlacers[0].teamLogoUrl ??
							tournament.firstPlacers[0].pickupAvatarUrl,
						members: tournament.firstPlacers
							.slice(0, MEMBERS_TO_SHOW)
							.map((firstPlacer) => ({
								customUrl: firstPlacer.customUrl,
								discordAvatar: firstPlacer.discordAvatar,
								discordId: firstPlacer.discordId,
								id: firstPlacer.id,
								username: firstPlacer.username,
								country: firstPlacer.country,
							})),
						notShownMembersCount:
							tournament.firstPlacers.length > MEMBERS_TO_SHOW
								? tournament.firstPlacers.length - MEMBERS_TO_SHOW
								: 0,
					}
				: null,
	};
}

function databaseTimestampWeekFromNow() {
	const now = new Date();

	now.setDate(now.getDate() + 7);

	return dateToDatabaseTimestamp(now);
}

function databaseTimestampSixHoursAgo() {
	const now = new Date();

	now.setHours(now.getHours() - 6);

	return dateToDatabaseTimestamp(now);
}
