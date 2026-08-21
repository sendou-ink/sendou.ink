import { sub } from "date-fns";
import { type Params, redirect } from "react-router";
import { ServerConfig } from "~/config.server";
import {
	type AuthenticatedUser,
	getUser,
	requireUser,
} from "~/features/auth/core/user.server";
import { clearCombinedStreamsCache } from "~/features/core/streams/streams.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as BracketRepository from "~/features/tournament-bracket/BracketRepository.server";
import { getTentativeTier } from "~/features/tournament-organization/core/tentativeTiers.server";
import { LRUCache } from "~/modules/cache";
import { hasPermission } from "~/modules/permissions/utils";
import { IN_MILLISECONDS } from "~/utils/cache.server";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import {
	errorToastIfFalsy,
	notFoundIfNullish,
	parseParams,
} from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import type { Unwrapped } from "~/utils/types";
import { tournamentPage } from "~/utils/urls";
import type { Bracket } from "./Bracket";
import { RunningTournaments } from "./RunningTournaments.server";
import {
	type BracketDerivedMeta,
	type OptionalIdObject,
	type SerializedBracket,
	Tournament,
	type TournamentStream,
} from "./Tournament";

/**
 * Everything a tournament is made of including brackets and streams.
 */
export async function tournamentData(tournamentId: number) {
	const ctx = await TournamentRepository.findById(tournamentId);
	if (!ctx) return null;

	const data = await BracketRepository.findByTournamentId(tournamentId);
	const tournamentHasStarted = data.stage.length > 0;

	const tentativeTier =
		!ctx.tier && ctx.organization?.id
			? getTentativeTier(ctx.organization.id, ctx.name)
			: null;

	return {
		data,
		participatedUsers:
			await TournamentRepository.findParticipatedUserIdsById(tournamentId),
		streams: await fetchTournamentStreams(tournamentId),
		ctx: {
			...ctx,
			tentativeTier,
			teams: ctx.teams.map(
				({
					teamLogoUrl,
					pickupAvatarUrl,
					inviteCode: _inviteCode,
					...team
				}): TournamentDataTeam => ({
					...team,
					logoUrl:
						teamLogoUrl ?? (tournamentHasStarted ? pickupAvatarUrl : null),
				}),
			),
		},
	};
}

/**
 * Live streams of the tournament read fresh from the database, bypassing the tournament
 * data cache. The streams view and bracket views ship these; the cached copy (read once
 * per cache fill) only serves the server-side consumers of running tournaments.
 */
export async function fetchTournamentStreams(
	tournamentId: number,
): Promise<TournamentStream[]> {
	const { participantStreams, castStreams } =
		await TournamentRepository.findStreamsByTournamentId(tournamentId);

	const memberStreams = participantStreams.map((stream) => ({
		thumbnailUrl: stream.thumbnailUrl,
		twitchUserName: stream.twitch,
		viewerCount: stream.viewerCount,
		userId: stream.userId as number | null,
		teamName: stream.teamName as string | null,
		user: {
			id: stream.id,
			username: stream.username,
			discordId: stream.discordId,
			discordAvatar: stream.discordAvatar,
			customUrl: stream.customUrl,
			customAvatarUrl: stream.customAvatarUrl,
		},
	}));

	const casts = castStreams.map((stream) => ({
		thumbnailUrl: stream.thumbnailUrl,
		twitchUserName: stream.twitch!,
		viewerCount: stream.viewerCount,
		userId: null,
		teamName: null,
		user: null,
	}));

	return [...memberStreams, ...casts].sort(
		(a, b) => b.viewerCount - a.viewerCount,
	);
}

export type TournamentData = NonNullable<Unwrapped<typeof tournamentData>>;

/**
 * What the tournament layout ships: everything every view needs and nothing a single view
 * needs. Match data is loaded per bracket by the views that render brackets.
 */
export type TournamentLayoutData = {
	ctx: TournamentData["ctx"];
	bracketsMeta: BracketDerivedMeta[];
};

/**
 * A tournament team as the tournament layout ships it: no per member profile data,
 * map pool or invite code. See {@link tournamentTeamsFullCached} for those.
 */
export type TournamentDataTeam = Omit<
	TournamentRepository.FindById["teams"][number],
	"teamLogoUrl" | "pickupAvatarUrl" | "inviteCode"
> & {
	/**
	 * Logo of the linked team, falling back to the pickup avatar once the tournament has
	 * started. The views that show pickup avatars before that (own team, organizer views)
	 * read them off {@link tournamentTeamsFullCached}, which censors per viewer.
	 */
	logoUrl: string | null;
};

/** The parts of a tournament that decide whether it may be seen at all. */
type TournamentVisibilityCtx = Pick<
	TournamentData["ctx"],
	"permissions" | "settings"
>;

/**
 * Ensures the tournament may be seen by the given user. Draft tournaments are only visible
 * to their organizers.
 *
 * Every loader under the tournament layout route must run this (normally via
 * {@link tournamentFromParams}). They are each reachable on their own via single fetch,
 * without the layout loader (and its check) ever running.
 *
 * @throws {Response} 404 if the tournament is a draft the user is not an organizer of
 */
export function requireTournamentVisible({
	ctx,
	user,
}: {
	ctx: TournamentVisibilityCtx;
	user: OptionalIdObject;
}) {
	if (!ctx.settings.isDraft) return;
	if (hasPermission(ctx, "ORGANIZE", user)) return;

	throw new Response(null, { status: 404 });
}

/**
 * Throws an error toast unless the user is an organizer of the tournament. For guarding
 * a single `_action` branch; whole-route guards use {@link tournamentFromParams} with
 * `for: "organizer"` instead.
 */
export function requireTournamentOrganizer(
	tournament: Tournament,
	user: AuthenticatedUser,
	message = "Not an organizer",
) {
	errorToastIfFalsy(tournament.isOrganizer(user), message);
}

/** Throws an error toast unless the user is an admin of the tournament. */
export function requireTournamentAdmin(
	tournament: Tournament,
	user: AuthenticatedUser,
) {
	errorToastIfFalsy(tournament.isAdmin(user), "Not a tournament admin");
}

type TournamentFromParamsOptions = {
	for: "view" | "action" | "organizer" | "admin";
};

/**
 * The shared preamble of `to.$id.*` loaders and actions: parses the tournament id from the
 * route params (404 on invalid), loads the tournament and runs the access guard.
 *
 * - `view`: anyone the tournament is visible to; cached read. The tournament is the same
 *   for every viewer, so one shared instance serves them all, amortizing bracket building.
 * - `action`: any logged-in user; fresh read from the database for actions that do their
 *   own per `_action` authorization.
 * - `organizer` / `admin`: like `action` but non-organizers/non-admins are redirected to
 *   the tournament front page.
 */
export async function tournamentFromParams(
	params: Params<string>,
	opts: { for: "view" },
): Promise<{
	tournament: Tournament;
	tournamentId: number;
	user: AuthenticatedUser | undefined;
}>;
export async function tournamentFromParams(
	params: Params<string>,
	opts: { for: "action" | "organizer" | "admin" },
): Promise<{
	tournament: Tournament;
	tournamentId: number;
	user: AuthenticatedUser;
}>;
export async function tournamentFromParams(
	params: Params<string>,
	opts: TournamentFromParamsOptions,
) {
	const { id: tournamentId } = parseParams({ params, schema: idObject });

	if (opts.for === "view") {
		const user = getUser();
		const tournament = await tournamentSharedCached(tournamentId);
		requireTournamentVisible({ ctx: tournament.ctx, user });

		return { tournament, tournamentId, user };
	}

	const user = requireUser();
	const tournament = await tournamentFromDB(tournamentId);
	requireTournamentVisible({ ctx: tournament.ctx, user });

	const isAuthorized =
		opts.for === "action" ||
		(opts.for === "organizer"
			? tournament.isOrganizer(user)
			: tournament.isAdmin(user));
	if (!isAuthorized) {
		throw redirect(tournamentPage(tournamentId));
	}

	return { tournament, tournamentId, user };
}

export async function tournamentFromDB(tournamentId: number) {
	const data = notFoundIfNullish(await tournamentData(tournamentId));

	const tournament = new Tournament(data);
	syncTournamentToRegistry(tournament);

	return tournament;
}

const TOURNAMENT_DATA_CACHE_MAX_ENTRIES = 250;
const TOURNAMENT_DATA_CACHE_TTL_MS = IN_MILLISECONDS.HALF_HOUR;

type TournamentDataCacheEntry = {
	storedAt: number;
	// caching promise ensures that if many requests are made for the same tournament
	// at the same time they reuse the same resolving promise
	data: ReturnType<typeof tournamentData>;
	// what the brackets derive from is the same for every viewer, so building them once
	// per cache fill serves every request
	tournament?: Tournament;
};

const tournamentDataCache = new LRUCache<number, TournamentDataCacheEntry>({
	max: TOURNAMENT_DATA_CACHE_MAX_ENTRIES,
});

export async function tournamentDataCached(tournamentId: number) {
	if (ServerConfig.disableCache) {
		return notFoundIfNullish(await tournamentData(tournamentId));
	}

	return notFoundIfNullish(await tournamentDataCacheEntry(tournamentId).data);
}

/**
 * A `Tournament` shared by every request for the lifetime of the cache entry. The bracket
 * level derivations (bracket state, standings, one bracket's data) are the same for every
 * viewer, so building the brackets happens once per cache fill instead of once per request.
 */
export async function tournamentSharedCached(tournamentId: number) {
	if (ServerConfig.disableCache) {
		return new Tournament(
			notFoundIfNullish(await tournamentData(tournamentId)),
		);
	}

	const entry = tournamentDataCacheEntry(tournamentId);

	if (!entry.tournament) {
		entry.tournament = new Tournament(notFoundIfNullish(await entry.data));
	}

	return entry.tournament;
}

/** State of every bracket of the tournament, without any of the match data it derives from. */
export async function bracketsMetaCached(
	tournamentId: number,
): Promise<BracketDerivedMeta[]> {
	return (await tournamentSharedCached(tournamentId)).bracketsDerivedMeta;
}

/**
 * One bracket with its match data, in the shape {@link Tournament.withBrackets} revives.
 * With a `groupId` only that group's rounds and matches are included, every group of the
 * bracket still being listed so that the view can offer switching to the others.
 */
export function serializeBracket(
	bracket: Bracket,
	args?: { groupId: number | null },
): SerializedBracket {
	return {
		id: bracket.id,
		idx: bracket.idx,
		preview: bracket.preview,
		data: args?.groupId ? groupsData(bracket.data, args.groupId) : bracket.data,
		type: bracket.type,
		participantsReady: bracket.participantsReady,
		name: bracket.name,
		teamsPendingCheckIn: bracket.teamsPendingCheckIn,
		createdAt: bracket.createdAt ?? null,
		sources: bracket.sources,
		seeding: bracket.seeding,
		settings: bracket.settings,
		requiresCheckIn: bracket.requiresCheckIn,
		startTime: bracket.startTime
			? dateToDatabaseTimestamp(bracket.startTime)
			: null,
	};
}

function groupsData(
	data: SerializedBracket["data"],
	groupId: number,
): SerializedBracket["data"] {
	return {
		...data,
		round: data.round.filter((round) => round.groupId === groupId),
		match: data.match.filter((match) => match.groupId === groupId),
	};
}

function tournamentDataCacheEntry(tournamentId: number) {
	const cached = tournamentDataCache.get(tournamentId);
	if (cached && Date.now() - cached.storedAt < TOURNAMENT_DATA_CACHE_TTL_MS) {
		return cached;
	}

	const entry: TournamentDataCacheEntry = {
		storedAt: Date.now(),
		data: tournamentData(tournamentId),
	};
	entry.data.catch(() => {
		if (tournamentDataCache.get(tournamentId) === entry) {
			tournamentDataCache.delete(tournamentId);
		}
	});

	tournamentDataCache.set(tournamentId, entry);

	return entry;
}

/** A tournament team with its full roster, as the views that render rosters get it. */
export type TournamentTeamFull = Unwrapped<typeof tournamentTeamsFullCached>;

type TournamentTeamsCacheEntry = {
	storedAt: number;
	teams: ReturnType<typeof TournamentRepository.findTeamsFullByTournamentId>;
	anonymousCensored?: ReturnType<typeof censoredTeams>;
};

const tournamentTeamsCache = new LRUCache<number, TournamentTeamsCacheEntry>({
	max: TOURNAMENT_DATA_CACHE_MAX_ENTRIES,
});

/**
 * Full rosters of a tournament's teams, censored for the given viewer. Its own cache
 * slice so that the (much smaller) tournament layout data does not have to carry them.
 */
export async function tournamentTeamsFullCached({
	user,
	tournamentId,
}: {
	user?: { id: number };
	tournamentId: number;
}) {
	const ctx = notFoundIfNullish(await tournamentDataCached(tournamentId));

	// pickup avatars and map pools are only revealed to organizers before the start
	const revealInfo =
		ctx.data.stage.length > 0 || hasPermission(ctx.ctx, "ORGANIZE", user);

	if (ServerConfig.disableCache) {
		return censoredTeams({
			teams:
				await TournamentRepository.findTeamsFullByTournamentId(tournamentId),
			revealInfo,
			user,
		});
	}

	const entry = tournamentTeamsCacheEntry(tournamentId);
	const teams = await entry.teams;

	if (user) return censoredTeams({ teams, revealInfo, user });

	if (!entry.anonymousCensored) {
		entry.anonymousCensored = censoredTeams({ teams, revealInfo });
	}

	return entry.anonymousCensored;
}

/**
 * {@link tournamentTeamsFullCached} in the tournament's own seed order, which is not
 * the order the team rows come back in.
 */
export async function tournamentTeamsFullInSeedOrder({
	tournament,
	user,
}: {
	tournament: Tournament;
	user?: { id: number };
}) {
	const rosterByTeamId = new Map(
		(
			await tournamentTeamsFullCached({ tournamentId: tournament.ctx.id, user })
		).map((team) => [team.id, team]),
	);

	return tournament.ctx.teams.flatMap((team) => {
		const withRoster = rosterByTeamId.get(team.id);
		return withRoster ? [withRoster] : [];
	});
}

function tournamentTeamsCacheEntry(tournamentId: number) {
	const cached = tournamentTeamsCache.get(tournamentId);
	if (cached && Date.now() - cached.storedAt < TOURNAMENT_DATA_CACHE_TTL_MS) {
		return cached;
	}

	const entry: TournamentTeamsCacheEntry = {
		storedAt: Date.now(),
		teams: TournamentRepository.findTeamsFullByTournamentId(tournamentId),
	};
	entry.teams.catch(() => {
		if (tournamentTeamsCache.get(tournamentId) === entry) {
			tournamentTeamsCache.delete(tournamentId);
		}
	});

	tournamentTeamsCache.set(tournamentId, entry);

	return entry;
}

function censoredTeams({
	teams,
	revealInfo,
	user,
}: {
	teams: TournamentRepository.TeamFull[];
	revealInfo: boolean;
	user?: { id: number };
}) {
	return teams.map((team) => {
		const isOwnTeam = team.members.some((member) => member.userId === user?.id);
		const pickupAvatarUrl =
			revealInfo || isOwnTeam ? team.pickupAvatarUrl : null;

		return {
			...team,
			mapPool: revealInfo || isOwnTeam ? team.mapPool : null,
			pickupAvatarUrl,
			logoUrl: team.team?.logoUrl ?? pickupAvatarUrl,
			inviteCode: isOwnTeam ? team.inviteCode : null,
		};
	});
}

export function clearTournamentDataCache(tournamentId: number) {
	tournamentDataCache.delete(tournamentId);
	tournamentTeamsCache.delete(tournamentId);
}

export function clearAllTournamentDataCache() {
	tournamentDataCache.clear();
	tournamentTeamsCache.clear();
}

const RUNNING_TOURNAMENT_MAX_AGE_HOURS = 6;

function mostRecentStartTime(tournament: Tournament) {
	const bracketStartTimes = tournament.ctx.settings.bracketProgression
		.filter((b) => b.startTime)
		.map((b) => databaseTimestampToDate(b.startTime!));

	const allStartTimes = [tournament.ctx.startsAt, ...bracketStartTimes];

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

/**
 * Rebuilds the running tournaments registry from the database, forgetting the
 * tournaments it held. E2E workers call this (via `/refresh-caches`) after
 * writing tournaments straight into the database file.
 */
export async function refreshRunningTournaments() {
	RunningTournaments.clear();

	await primeRunningTournamentsCache();
}

async function primeRunningTournamentsCache() {
	const tournamentIds = await TournamentRepository.findRunningTournamentIds();

	for (const tournamentId of tournamentIds) {
		const data = await tournamentData(tournamentId);
		if (!data) continue;

		const tournament = new Tournament(data);
		syncTournamentToRegistry(tournament);
	}
}

await primeRunningTournamentsCache();
