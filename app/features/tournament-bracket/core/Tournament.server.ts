import { sub } from "date-fns";
import { ServerConfig } from "~/config.server";
import { clearCombinedStreamsCache } from "~/features/core/streams/streams.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as BracketRepository from "~/features/tournament-bracket/BracketRepository.server";
import type { TournamentManagerDataSet } from "~/features/tournament-bracket/core/engine/types";
import { getTentativeTier } from "~/features/tournament-organization/core/tentativeTiers.server";
import { isAdmin } from "~/modules/permissions/utils";
import { databaseTimestampToDate } from "~/utils/dates";
import { notFoundIfFalsy } from "~/utils/remix.server";
import type { Unwrapped } from "~/utils/types";
import { RunningTournaments } from "./RunningTournaments.server";
import { Tournament } from "./Tournament";


const combinedTournamentData = async (tournamentId: number) => {
	const ctx = await TournamentRepository.findById(tournamentId);
	if (!ctx) return null;

	return {
		data: await BracketRepository.findByTournamentId(tournamentId),
		ctx,
	};
};

export type TournamentData = NonNullable<Unwrapped<typeof tournamentData>>;
export type TournamentDataTeam = TournamentData["ctx"]["teams"][number];
export async function tournamentData({
	user,
	tournamentId,
}: {
	user?: { id: number };
	tournamentId: number;
}) {
	const data = await combinedTournamentData(tournamentId);
	if (!data) return null;

	return dataMapped({ user, ...data });
}

function dataMapped({
	data,
	ctx,
	user,
}: {
	data: TournamentManagerDataSet;
	ctx: TournamentRepository.FindById;
	user?: { id: number };
}) {
	const tournamentHasStarted = data.stage.length > 0;
	const isOrganizer =
		ctx.author.id === user?.id ||
		ctx.staff.some(
			(staff) => staff.id === user?.id && staff.role === "ORGANIZER",
		) ||
		isAdmin(user);
	const revealInfo = tournamentHasStarted || isOrganizer;

	const tentativeTier =
		!ctx.tier && ctx.organization?.id
			? getTentativeTier(ctx.organization.id, ctx.name)
			: null;

	return {
		data,
		ctx: {
			...ctx,
			tentativeTier,
			teams: ctx.teams.map((team) => {
				const isOwnTeam = team.members.some(
					(member) => member.userId === user?.id,
				);

				return {
					...team,
					mapPool: revealInfo || isOwnTeam ? team.mapPool : null,
					pickupAvatarUrl:
						revealInfo || isOwnTeam ? team.pickupAvatarUrl : null,
					inviteCode: isOwnTeam ? team.inviteCode : null,
				};
			}),
		},
	};
}

export async function tournamentFromDB(args: {
	user: { id: number } | undefined;
	tournamentId: number;
}) {
	const data = notFoundIfFalsy(await tournamentData(args));

	const tournament = new Tournament({ ...data, simulateBrackets: false });
	syncTournamentToRegistry(tournament);

	return tournament;
}

export async function tournamentFromDBCached(args: {
	user: { id: number } | undefined;
	tournamentId: number;
}) {
	const data = notFoundIfFalsy(await tournamentDataCached(args));

	return new Tournament({ ...data, simulateBrackets: false });
}

// caching promise ensures that if many requests are made for the same tournament
// at the same time they reuse the same resolving promise
const tournamentDataCache = new Map<
	number,
	ReturnType<typeof combinedTournamentData>
>();
export async function tournamentDataCached({
	user,
	tournamentId,
}: {
	user?: { id: number };
	tournamentId: number;
}) {
	if (ServerConfig.disableCache) {
		return notFoundIfFalsy(await tournamentData({ user, tournamentId }));
	}

	if (!tournamentDataCache.has(tournamentId)) {
		tournamentDataCache.set(tournamentId, combinedTournamentData(tournamentId));
	}

	const data = notFoundIfFalsy(await tournamentDataCache.get(tournamentId));

	return dataMapped({ user, ...data });
}

export function clearTournamentDataCache(tournamentId: number) {
	tournamentDataCache.delete(tournamentId);
}

export function clearAllTournamentDataCache() {
	tournamentDataCache.clear();
}

const RUNNING_TOURNAMENT_MAX_AGE_HOURS = 6;

function mostRecentStartTime(tournament: Tournament) {
	const bracketStartTimes = tournament.ctx.settings.bracketProgression
		.filter((b) => b.startTime)
		.map((b) => databaseTimestampToDate(b.startTime!));

	const allStartTimes = [tournament.ctx.startTime, ...bracketStartTimes];

	return allStartTimes
		.filter((t) => t <= new Date())
		.sort((a, b) => b.getTime() - a.getTime())[0];
}

function isTournamentLive(tournament: Tournament) {
	if (!tournament.hasStarted || tournament.everyBracketOver) return false;

	const cutoff = sub(new Date(), { hours: RUNNING_TOURNAMENT_MAX_AGE_HOURS });
	const latestStartTime = mostRecentStartTime(tournament);

	return Boolean(latestStartTime && latestStartTime >= cutoff);
}

/**
 * Re-evaluates liveness of every tournament in the running tournaments registry,
 * evicting those that are no longer live (e.g. abandoned tournaments whose latest
 * day started over 6 hours ago and no page load has triggered a re-sync).
 */
export function evictStaleRunningTournaments() {
	for (const tournament of RunningTournaments.all) {
		syncTournamentToRegistry(tournament);
	}
}

function syncTournamentToRegistry(tournament: Tournament) {
	const isRunning = isTournamentLive(tournament);
	const wasInRegistry = RunningTournaments.has(tournament.ctx.id);

	if (isRunning) {
		RunningTournaments.add(tournament);
		if (!wasInRegistry) {
			clearCombinedStreamsCache();
		}
	} else {
		if (wasInRegistry) {
			clearCombinedStreamsCache();
		}
		RunningTournaments.remove(tournament.ctx.id);
	}
}

async function primeRunningTournamentsCache() {
	const tournamentIds = await TournamentRepository.findRunningTournamentIds();

	for (const tournamentId of tournamentIds) {
		const data = await tournamentData({ user: undefined, tournamentId });
		if (!data) continue;

		const tournament = new Tournament({ ...data, simulateBrackets: false });
		syncTournamentToRegistry(tournament);
	}
}

await primeRunningTournamentsCache();
