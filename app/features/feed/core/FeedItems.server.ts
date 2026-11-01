import cachified from "@epic-web/cachified";
import { subDays } from "date-fns";
import * as R from "remeda";
import { Config } from "~/config";
import { allEntries as allChangelogEntries } from "~/features/changelog/core/entries.server";
import * as FriendRepository from "~/features/friends/FriendRepository.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import { cachedFullUserLeaderboard } from "~/features/leaderboards/core/leaderboards.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as MatchProfileRepository from "~/features/match-profile/MatchProfileRepository.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { ordinalToSp } from "~/features/mmr/mmr-utils";
import { userSkills } from "~/features/mmr/tiered.server";
import {
	rangeToMonthYear,
	seasonToVotingRange,
} from "~/features/plus-voting/core/voting-time";
import * as PlusVotingRepository from "~/features/plus-voting/PlusVotingRepository.server";
import * as ReportedWeaponRepository from "~/features/sendouq-match/ReportedWeaponRepository.server";
import * as SQMatchRepository from "~/features/sendouq-match/SQMatchRepository.server";
import * as SplatoonRotationRepository from "~/features/splatoon-rotations/SplatoonRotationRepository.server";
import type {
	BuildAbilitiesTuple,
	MainWeaponId,
	StageId,
} from "~/modules/in-game-lists/types";
import { cache, IN_MILLISECONDS, ttl } from "~/utils/cache.server";
import {
	databaseTimestampNow,
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import type { CommonUser } from "~/utils/kysely.server";
import { logger } from "~/utils/logger";
import { LUTI_PAGE } from "~/utils/urls";
import * as FeedEventRepository from "../FeedEventRepository.server";
import * as FeedRepository from "../FeedRepository.server";
import {
	FEED_ANNOUNCEMENTS,
	FEED_BRACKET_PREVIEW_TOP_TEAMS,
	FEED_EVENT_MAX_RETENTION_DAYS,
	FEED_EVENT_RETENTION_DAYS,
	FEED_FEATURED_RESULT_MAX_TIER,
	FEED_FEATURED_RESULT_MIN_TEAMS,
	FEED_LEADERBOARD_TOP_COUNT,
	FEED_MOCK_ANNOUNCEMENT,
	FEED_MOCK_LUTI_SEASON,
	FEED_ROTATION_LOOKBACK_WEEKS,
	FEED_SEASON_COUNTDOWN_DAYS,
	FEED_SITE_MILESTONE_MIN,
	FEED_SPOTLIGHTS,
	FEED_SQ_UPSET_MIN_TIER_STEPS,
	FEED_TOURNAMENT_UPSET_MIN_SEED_GAP,
	type FeedItemType,
} from "../feed-constants";
import type {
	FeedEventDataByType,
	FeedEventType,
	FeedTier,
} from "../feed-types";
import * as FeedCache from "./FeedCache.server";
import * as FeedEvents from "./FeedEvents";
import * as FeedItemIds from "./FeedItemIds";
import * as FeedRotations from "./FeedRotations";
import * as FeedSchedule from "./FeedSchedule";

const HOUR = 3600;
const DAY = 24 * HOUR;
/** Shortly after the latest SendouQ match, so a database snapshot looks like it's live */
const NOW_AFTER_LATEST_MATCH_SECONDS = 30 * 60;
const MINUTE_MS = 60 * 1000;
/** How far back the latest team join, build, friendship and lobby of a friend are looked for */
const RECENT_ACTIVITY_DAYS = 30;
const HOUR_MS = 60 * MINUTE_MS;

/** Items that look the same to every viewer, built once a minute for all of them */
const SHARED_ITEM_TYPES = new Set<FeedItemType>([
	"SQ_SEASON_START",
	"LEADERBOARD_TOP",
	"SQ_META",
	"STREAM_LIVE",
	"TO_LFG",
	"TO_SHOWCASE",
	"TO_RESULT_FEATURED",
	"ON_THIS_DAY",
	"SCRIM_POST",
	"VOD_NEW",
	"ANNOUNCEMENT",
	"TO_LUTI_REGISTRATION",
	"SITE_MILESTONE",
	"FEATURE_SPOTLIGHT",
	"INSTALL_APP",
	"SITE_UPDATE",
	"VOICE_ROOM",
	"CALENDAR_EVENT_NEW",
]);

/** `REAL` is the feed as it is now, `TEST` the dev test page: "now" follows the latest SendouQ match and items fall back to placeholders and rows of anyone */
export type FeedMode = "REAL" | "TEST";

export interface FeedContext {
	mode: FeedMode;
	viewerId: number;
	friendIds: number[];
	friendIdSet: Set<number>;
	/** Database timestamp everything is relative to */
	now: number;
	season: number | null;
	previousSeason: number | null;
	/** Queries several items of the same request share, by key */
	memo: Map<string, Promise<unknown>>;
}

/** What the items that look the same to every viewer are built from */
type SharedFeedContext = Pick<
	FeedContext,
	"mode" | "now" | "season" | "previousSeason"
>;

interface BuiltItem<D> {
	at: number;
	/** Who the item is about, for the ranking's diversity pass */
	actorKey: string;
	data: D;
}

const BUILDERS = {
	SQ_SET: buildSqSet,
	SQ_STREAK: buildSqStreak,
	SQ_LEADERBOARD: buildSqLeaderboard,
	SQ_MILESTONE: buildSqMilestone,
	SQ_SEASON_RECAP: buildSqSeasonRecap,
	SQ_RIVALRY: buildSqRivalry,
	SQ_SEASON_START: buildSqSeasonStart,
	LEADERBOARD_TOP: buildLeaderboardTop,
	SQ_META: buildSqMeta,
	LOBBY_RECAP: buildLobbyRecap,
	STREAM_LIVE: buildStreamLive,
	TO_WIN: buildTournamentWin,
	TO_PODIUM: buildTournamentPodium,
	TO_DIGEST: buildTournamentDigest,
	TO_REGISTERED: buildTournamentRegistered,
	TO_UPSET: buildTournamentUpset,
	TO_LFG: buildTournamentLfg,
	TO_ORG_NEW: buildOrganizationTournament,
	TO_SERIES: buildSeriesStandings,
	TO_VOD: buildTournamentVod,
	TO_BADGE: buildTournamentBadge,
	TO_TROPHY: buildTrophy,
	TO_SHOWCASE: buildTournamentShowcase,
	TO_RESULT_FEATURED: buildFeaturedResult,
	TO_BRACKET_PREVIEW: buildBracketPreview,
	TO_LUTI_REGISTRATION: buildLutiRegistration,
	ON_THIS_DAY: buildOnThisDay,
	TO_STAFF: buildTournamentStaff,
	TEAM_JOIN: buildTeamJoin,
	TEAM_NEW: buildTeamNew,
	TEAM_ANNIVERSARY: buildTeamAnniversary,
	TEAM_AVAILABILITY: buildTeamAvailability,
	SCRIM_POST: buildScrimPost,
	SCRIM_RESULT: buildScrimResult,
	LFG_PLAYER: buildLfgPlayer,
	LFG_TEAM: buildLfgTeam,
	ART_NEW: buildArtNew,
	ART_TAGGED: buildArtTagged,
	ART_COMMISSIONS: buildArtCommissions,
	BUILD_NEW: buildBuildNew,
	BUILD_FOR_YOU: buildBuildForYou,
	VOD_NEW: buildVodNew,
	XRANK_TOP_500: buildXRankTop500,
	SCANNER_SCORECARD: buildScannerScorecard,
	FRIEND_NEW: buildFriendNew,
	FRIEND_SUGGEST: buildFriendSuggest,
	COMEBACK: buildComeback,
	FIRST_TIME: buildFirstTime,
	PLUS_RESULTS: buildPlusResults,
	ANNOUNCEMENT: buildAnnouncement,
	SITE_MILESTONE: buildSiteMilestone,
	FEATURE_SPOTLIGHT: buildFeatureSpotlight,
	INSTALL_APP: buildInstallApp,
	SITE_UPDATE: buildSiteUpdate,
	ROTATION: buildRotation,
	VOICE_ROOM: buildVoiceRoom,
	MEMORY: buildMemory,
	CALENDAR_EVENT_NEW: buildCalendarEventNew,
} satisfies Record<
	FeedItemType,
	(ctx: FeedContext) => Promise<BuiltItem<unknown> | null>
>;

export type FeedItemData<T extends FeedItemType> = NonNullable<
	Awaited<ReturnType<(typeof BUILDERS)[T]>>
>["data"];

export type FeedItem = {
	[T in FeedItemType]: {
		/** See `FeedItemIds` */
		id: string;
		type: T;
		at: number;
		actorKey: string;
		data: FeedItemData<T>;
	};
}[FeedItemType];

/** The feed context of the viewer. In `TEST` mode "now" is shortly after the latest SendouQ match. */
export async function contextFor({
	viewerId,
	mode,
}: {
	viewerId: number;
	mode: FeedMode;
}): Promise<FeedContext> {
	const friendIds = await FriendRepository.findFriendIds(viewerId);
	const now = mode === "TEST" ? await testNow() : databaseTimestampNow();
	const nowDate = databaseTimestampToDate(now);

	return {
		mode,
		viewerId,
		friendIds,
		friendIdSet: new Set(friendIds),
		now,
		season: Seasons.currentOrPrevious(nowDate)?.nth ?? null,
		previousSeason: Seasons.previous(nowDate)?.nth ?? null,
		memo: new Map(),
	};
}

/** Builds the item of the given type as seen by the viewer of the context, `null` if there is none. */
async function buildOne(
	type: FeedItemType,
	ctx: FeedContext,
): Promise<FeedItem | null> {
	const built = SHARED_ITEM_TYPES.has(type)
		? await FeedCache.cached({
				key: `${ctx.mode}-shared-item-${type}`,
				ttlMs: MINUTE_MS,
				getFreshValue: () => BUILDERS[type](ctx),
			})
		: await BUILDERS[type](ctx);
	if (!built) return null;

	const at = Math.min(built.at, ctx.now);

	return {
		id: FeedItemIds.make({ type, at, actorKey: built.actorKey }),
		type,
		...built,
		at,
	} as FeedItem;
}

/** The post with the id as the viewer sees it now, `null` once their feed no longer has it. */
export async function findById({
	id,
	viewerId,
}: {
	id: string;
	viewerId: number;
}): Promise<{ item: FeedItem; ctx: FeedContext } | null> {
	const type = FeedItemIds.typeOf(id);
	if (!type) return null;

	for (const mode of ["REAL", "TEST"] as const) {
		const ctx = await contextFor({ viewerId, mode });
		const item = await buildOne(type, ctx);
		if (item?.id === id) return { item, ctx };
	}

	return null;
}

/**
 * Builds one item of every type that has matching rows, as seen by the viewer of the context.
 * A builder that throws is logged and skipped so one broken query doesn't take the page down.
 */
export async function buildAll(ctx: FeedContext): Promise<FeedItem[]> {
	const items: FeedItem[] = [];

	for (const type of R.keys(BUILDERS)) {
		try {
			const item = await buildOne(type, ctx);
			if (item) items.push(item);
		} catch (error) {
			logger.error(`Feed item ${type} failed to build`, error);
		}
	}

	return items;
}

// ---------- SendouQ ----------

async function buildSqSet(ctx: FeedContext) {
	const promotion = (await friendEvents(ctx, "SQ_PROMOTION")).find(
		(event) => event.data.season === ctx.season,
	);
	const upset = (await friendEvents(ctx, "SQ_UPSET")).at(0);

	if (promotion && (!upset || promotion.at >= upset.at)) {
		return sqSetItem({
			matchId: promotion.data.matchId,
			userId: promotion.userId,
			promotion: R.pick(promotion.data, ["from", "to"]),
		});
	}

	return upset
		? sqSetItem({ matchId: upset.data.matchId, userId: upset.userId })
		: null;
}

function sqSetItem(args: Parameters<typeof freshSqSetItem>[0]) {
	return FeedCache.cached({
		key: `sq-set-${args.matchId}-${args.userId}-${Boolean(args.promotion)}`,
		ttlMs: 10 * MINUTE_MS,
		getFreshValue: () => freshSqSetItem(args),
	});
}

async function freshSqSetItem({
	matchId,
	userId,
	promotion = null,
}: {
	matchId: number;
	userId: number;
	promotion?: { from: FeedTier; to: FeedTier } | null;
}) {
	const match = await SQMatchRepository.findById(matchId);
	if (!match) return null;
	const weapons = await ReportedWeaponRepository.findByMatchId(matchId);

	const ownGroup = match.groupAlpha.members.some((m) => m.id === userId)
		? match.groupAlpha
		: match.groupBravo;
	const otherGroup =
		ownGroup === match.groupAlpha ? match.groupBravo : match.groupAlpha;
	const playedMaps = match.mapList.filter((map) => map.winnerGroupId !== null);
	const mapWins = playedMaps.filter(
		(map) => map.winnerGroupId === ownGroup.id,
	).length;
	const isWin = mapWins > playedMaps.length - mapWins;

	const weaponOf = (memberId: number) =>
		R.firstBy(
			Object.entries(
				R.countBy(
					(weapons ?? []).filter((weapon) => weapon.userId === memberId),
					(weapon) => String(weapon.weaponSplId),
				),
			),
			[([, count]) => count, "desc"],
		)?.[0];
	const side = (group: typeof ownGroup) =>
		group.members.map((member) => {
			const weapon = weaponOf(member.id);
			return {
				user: R.pick(member, ["id", "username", "customUrl", "avatar"]),
				weaponSplId: weapon ? (Number(weapon) as MainWeaponId) : null,
			};
		});
	const groupTier = (group: typeof ownGroup) =>
		group.tierName
			? { name: group.tierName, isPlus: Boolean(group.tierIsPlus) }
			: null;
	const ownTier = groupTier(ownGroup);
	const opponentTier = groupTier(otherGroup);
	const skillDifference = match.skillDifferences.users[userId];
	const actor = ownGroup.members.find((m) => m.id === userId)!;

	return {
		at: match.createdAt,
		actorKey: String(userId),
		data: {
			actor: R.pick(actor, ["id", "username", "customUrl", "avatar"]),
			matchId: match.id,
			isWin,
			isUpset:
				isWin &&
				ownTier !== null &&
				opponentTier !== null &&
				FeedEvents.tierRank(opponentTier) - FeedEvents.tierRank(ownTier) >=
					FEED_SQ_UPSET_MIN_TIER_STEPS,
			FEED_TOURNAMENT_UPSET_MIN_SEED_GAP,
			opponentTier,
			promotion,
			score: [mapWins, playedMaps.length - mapWins] as const,
			maps: playedMaps.map((map) => ({
				mode: map.mode,
				stageId: map.stageId,
				isWin: map.winnerGroupId === ownGroup.id,
			})),
			team: side(ownGroup),
			opponents: side(otherGroup),
			spDiff: skillDifference?.calculated ? skillDifference.spDiff : null,
			newSp:
				skillDifference?.calculated && skillDifference.newSp !== undefined
					? skillDifference.newSp
					: null,
			tier:
				actor.tierName && actor.tierName !== "CALCULATING"
					? { name: actor.tierName, isPlus: Boolean(actor.tierIsPlus) }
					: null,
		},
	};
}

async function buildSqStreak(ctx: FeedContext) {
	const best = R.firstBy(await friendEvents(ctx, "SQ_STREAK"), [
		(event) => event.data.streak,
		"desc",
	]);
	if (!best) return null;

	const users = await usersById([best.userId]);
	const skill =
		ctx.season !== null
			? (await userSkills(ctx.season)).userSkills[best.userId]
			: undefined;

	return {
		at: best.at,
		actorKey: String(best.userId),
		data: {
			actor: users.get(best.userId)!,
			streak: best.data.streak,
			sp: skill ? ordinalToSp(skill.ordinal) : null,
			tier: skill?.tier ?? null,
		},
	};
}

async function buildSqLeaderboard(ctx: FeedContext) {
	if (ctx.season === null) return null;

	const leaderboard = await cachedFullUserLeaderboard(ctx.season);
	const index = leaderboard.findIndex((candidate) =>
		ctx.friendIdSet.has(candidate.id),
	);
	if (index === -1) return null;

	const entry = leaderboard[index];
	const season = ctx.season;
	const latestSetAt = await FeedCache.cached({
		key: `latest-set-at-${entry.id}-${season}`,
		ttlMs: MINUTE_MS,
		getFreshValue: () =>
			FeedRepository.findLatestSkillCreatedAt({ userId: entry.id, season }),
	});
	if (!latestSetAt) return null;

	return {
		at: latestSetAt,
		actorKey: String(entry.id),
		data: {
			actor: R.pick(entry, ["id", "username", "customUrl", "avatar"]),
			placement: entry.placementRank,
			total: leaderboard.length,
			tier: entry.tier,
			neighbors: leaderboard
				.slice(Math.max(0, index - 2), index + 3)
				.map((neighbor) => ({
					user: R.pick(neighbor, ["id", "username", "customUrl", "avatar"]),
					placement: neighbor.placementRank,
					sp: neighbor.power,
				})),
		},
	};
}

async function buildSqMilestone(ctx: FeedContext) {
	const latest = (await friendEvents(ctx, "SQ_MILESTONE")).at(0);
	if (!latest) return null;

	const users = await usersById([latest.userId]);

	return {
		at: latest.at,
		actorKey: String(latest.userId),
		data: {
			actor: users.get(latest.userId)!,
			milestone: latest.data.milestone,
			since: latest.data.since,
		},
	};
}

async function buildSqSeasonRecap(ctx: FeedContext) {
	if (ctx.previousSeason === null) return null;

	const leaderboard = await cachedFullUserLeaderboard(ctx.previousSeason);
	const earlierSeasonSkills: Array<
		Awaited<ReturnType<typeof userSkills>>["userSkills"]
	> = [];
	for (const season of R.range(0, ctx.previousSeason)) {
		earlierSeasonSkills.push((await userSkills(season)).userSkills);
	}
	const isNewPeak = (candidate: (typeof leaderboard)[number]) =>
		earlierSeasonSkills.every((skills) => {
			const skill = skills[candidate.id];
			return (
				!skill ||
				skill.approximate ||
				FeedEvents.tierRank(skill.tier) < FeedEvents.tierRank(candidate.tier)
			);
		});
	const entry = leaderboard.find(
		(e) => ctx.friendIdSet.has(e.id) && isNewPeak(e),
	);
	if (!entry) return null;

	const season = ctx.previousSeason;
	const mapResults = await FeedCache.cached({
		key: `map-results-${entry.id}-${season}`,
		ttlMs: HOUR_MS,
		getFreshValue: () =>
			FeedRepository.findMapResultsByUserId({ userId: entry.id, season }),
	});
	const playedEnough = mapResults.filter(
		(result) => result.wins + result.losses >= 6,
	);
	const winRate = (result: (typeof mapResults)[number]) =>
		result.wins / (result.wins + result.losses);
	const bestMap = R.firstBy(playedEnough, [winRate, "desc"]);
	const worstMap = R.firstBy(playedEnough, [winRate, "asc"]);

	const previousSeasonEndsAt = Seasons.previous(
		databaseTimestampToDate(ctx.now),
	)?.ends;
	if (!previousSeasonEndsAt) return null;

	return {
		at: dateToDatabaseTimestamp(previousSeasonEndsAt),
		actorKey: String(entry.id),
		data: {
			actor: R.pick(entry, ["id", "username", "customUrl", "avatar"]),
			season: ctx.previousSeason,
			placement: entry.placementRank,
			total: leaderboard.length,
			tier: entry.tier,
			sp: entry.power,
			weaponSplId: entry.weaponSplId ?? null,
			mapWins: R.sumBy(mapResults, (result) => result.wins),
			mapLosses: R.sumBy(mapResults, (result) => result.losses),
			bestMap: bestMap ?? null,
			worstMap: worstMap === bestMap ? null : (worstMap ?? null),
		},
	};
}

async function buildSqRivalry(ctx: FeedContext) {
	const rivalry = R.firstBy(
		(await friendEvents(ctx, "SQ_RIVALRY")).filter(
			(event) => event.data.season === ctx.season,
		),
		[(event) => event.data.setWins + event.data.setLosses, "desc"],
	);
	if (!rivalry) return null;

	const users = await usersById([rivalry.userId, rivalry.data.otherUserId]);

	return {
		at: rivalry.at,
		actorKey: String(rivalry.userId),
		data: {
			actor: users.get(rivalry.userId)!,
			other: users.get(rivalry.data.otherUserId)!,
			sets: [rivalry.data.setWins, rivalry.data.setLosses] as const,
			maps: [rivalry.data.mapWins, rivalry.data.mapLosses] as const,
		},
	};
}

async function buildSqSeasonStart(ctx: SharedFeedContext) {
	const nowDate = databaseTimestampToDate(ctx.now);
	const upcoming = Seasons.next(nowDate);
	const countdownStartsAt = upcoming
		? subDays(upcoming.starts, FEED_SEASON_COUNTDOWN_DAYS)
		: null;
	const isCountdown =
		countdownStartsAt !== null && countdownStartsAt <= nowDate;
	const season = isCountdown ? upcoming : Seasons.currentOrPrevious(nowDate);
	if (!season) return null;

	return {
		at: dateToDatabaseTimestamp(
			isCountdown ? countdownStartsAt : season.starts,
		),
		actorKey: "SQ_SEASON_START",
		data: {
			nth: season.nth,
			isCountdown,
			startsAt: dateToDatabaseTimestamp(season.starts),
			endsAt: dateToDatabaseTimestamp(season.ends),
		},
	};
}

async function buildLeaderboardTop(ctx: SharedFeedContext) {
	if (ctx.season === null) return null;

	const publishedAt = dateToDatabaseTimestamp(
		FeedSchedule.latestWeekly(databaseTimestampToDate(ctx.now), {
			weekday: FeedSchedule.WEEKDAY.SUNDAY,
		}),
	);
	const snapshot = await leaderboardSnapshot({
		season: ctx.season,
		at: publishedAt,
	});
	if (snapshot.players.length === 0) return null;

	return {
		at: publishedAt,
		actorKey: "LEADERBOARD_TOP",
		data: snapshot,
	};
}

/** Top of the season's leaderboards as they were at `at`, with each player's change since a week earlier */
function leaderboardSnapshot({ season, at }: { season: number; at: number }) {
	return cachified({
		key: `feed-leaderboard-snapshot-${season}-${at}`,
		cache,
		ttl: ttl(IN_MILLISECONDS.TWO_DAYS),
		async getFreshValue() {
			const players = await LeaderboardRepository.findUserSPLeaderboard(
				season,
				{ before: at },
			);
			const weekBefore = new Map(
				(
					await LeaderboardRepository.findUserSPLeaderboard(season, {
						before: at - 7 * DAY,
					})
				).map((entry) => [entry.id, entry]),
			);
			const teams = await LeaderboardRepository.findTeamLeaderboardBySeason({
				season,
				onlyOneEntryPerUser: true,
				before: at,
			});

			return {
				season,
				players: players.slice(0, FEED_LEADERBOARD_TOP_COUNT).map((player) => {
					const previous = weekBefore.get(player.id);

					return {
						user: R.pick(player, ["id", "username", "customUrl", "avatar"]),
						placement: player.placementRank,
						previousPlacement: previous?.placementRank ?? null,
						sp: player.power,
						weeklyChange: previous
							? Math.round((player.power - previous.power) * 10) / 10
							: null,
					};
				}),
				teams: teams
					.filter((entry) => entry.placementRank !== null)
					.slice(0, FEED_LEADERBOARD_TOP_COUNT)
					.map((entry) => ({
						placement: entry.placementRank,
						sp: entry.power,
						team: entry.team
							? R.pick(entry.team, ["name", "customUrl", "avatarUrl"])
							: null,
						members: entry.members,
					})),
			};
		},
	});
}

async function buildSqMeta(ctx: SharedFeedContext) {
	const publishedAt = dateToDatabaseTimestamp(
		FeedSchedule.latestWeekly(databaseTimestampToDate(ctx.now), {
			weekday: FeedSchedule.WEEKDAY.MONDAY,
		}),
	);
	const thisWeek = await FeedRepository.findWeaponUsageCounts({
		from: publishedAt - 7 * DAY,
		to: publishedAt,
	});
	const lastWeek = await FeedRepository.findWeaponUsageCounts({
		from: publishedAt - 14 * DAY,
		to: publishedAt - 7 * DAY,
	});
	const totalThisWeek = R.sumBy(thisWeek, (row) => row.count);
	const totalLastWeek = R.sumBy(lastWeek, (row) => row.count);
	if (totalThisWeek < 100 || totalLastWeek < 100) return null;

	const changes = R.sortBy(
		thisWeek
			.filter((row) => row.count >= totalThisWeek / 50)
			.map((row) => {
				const share = row.count / totalThisWeek;
				const previousCount =
					lastWeek.find((previous) => previous.weaponSplId === row.weaponSplId)
						?.count ?? 0;
				const previousShare = previousCount / totalLastWeek;

				return {
					weaponSplId: row.weaponSplId,
					sharePercentage: Math.round(share * 1000) / 10,
					changePercentage: previousShare
						? Math.round((share / previousShare - 1) * 100)
						: 100,
				};
			}),
		[(change) => change.changePercentage, "desc"],
	);
	if (changes.length < 5) return null;

	return {
		at: publishedAt,
		actorKey: "SQ_META",
		data: {
			rising: changes.slice(0, 3),
			falling: changes.slice(-2).reverse(),
			reportCount: totalThisWeek,
		},
	};
}

async function buildLobbyRecap(ctx: FeedContext) {
	const lobby = (
		await FeedCache.cached({
			key: `${ctx.mode}-recent-lobbies`,
			ttlMs: MINUTE_MS,
			getFreshValue: () =>
				FeedRepository.findAllLobbiesEndedAfter(
					ctx.now - RECENT_ACTIVITY_DAYS * DAY,
				),
		})
	).find(
		(candidate) =>
			candidate.endedAt <= ctx.now &&
			candidate.players.some((player) => ctx.friendIdSet.has(player.userId)),
	);
	if (!lobby) return null;

	return {
		at: lobby.endedAt,
		actorKey: String(lobby.hostUserId),
		data: {
			lobbyId: lobby.id,
			name: lobby.name,
			setCount: lobby.setCount ?? 0,
			playerCount: lobby.playerCount ?? 0,
			top: lobby.top,
		},
	};
}

async function buildStreamLive(ctx: SharedFeedContext) {
	const streams = await FeedRepository.findLiveStreams();
	if (streams.length === 0) return null;

	const users = await usersById(
		streams.flatMap((stream) => (stream.userId ? [stream.userId] : [])),
	);
	const toStream = (stream: (typeof streams)[number]) => ({
		account: stream.account,
		platform: stream.platform,
		viewerCount: stream.viewerCount,
		user: stream.userId ? (users.get(stream.userId) ?? null) : null,
	});

	return {
		at: ctx.now - 25 * 60,
		actorKey: streams[0].account,
		data: {
			stream: toStream(streams[0]),
			others: streams.slice(1).map(toStream),
		},
	};
}

// ---------- Tournaments ----------

async function friendResults(ctx: FeedContext, sinceDays: number) {
	return (await friendEvents(ctx, "TO_RESULT", sinceDays)).map((event) => ({
		...event.data,
		userId: event.userId,
		startsAt: event.at,
	}));
}

async function resultCard(
	ctx: FeedContext,
	result: Awaited<ReturnType<typeof friendResults>>[number],
) {
	const tournament = await tournamentById(result.tournamentId);
	const team = await tournamentTeamById(result.tournamentTeamId);
	const users = await usersById([result.userId]);

	return {
		actor: users.get(result.userId)!,
		tournament,
		team,
		placement: result.placement,
		participantCount: result.participantCount,
		setWins: result.setWins,
		setLosses: result.setLosses,
		friendsOnTeam: team.members.filter(
			(member) => ctx.friendIdSet.has(member.id) && member.id !== result.userId,
		),
	};
}

async function buildTournamentWin(ctx: FeedContext) {
	const result = (await friendResults(ctx, 14)).find(
		(r) => r.placement === 1 && r.participantCount >= 12,
	);
	if (!result) return null;

	const card = await resultCard(ctx, result);
	const { seriesWin, path } = await FeedCache.cached({
		key: `tournament-win-${result.tournamentTeamId}-${result.userId}`,
		ttlMs: HOUR_MS,
		getFreshValue: () => tournamentWinPath(result),
	});

	return {
		at: result.startsAt + 6 * HOUR,
		actorKey: String(result.userId),
		data: { ...card, seriesWin, path },
	};
}

async function tournamentWinPath(
	result: Awaited<ReturnType<typeof friendResults>>[number],
) {
	const seriesWin = await seriesWinOf(result);
	const matches = await FeedRepository.findTournamentMatchesByTeamId({
		tournamentId: result.tournamentId,
		tournamentTeamId: result.tournamentTeamId,
	});
	const lastMatches = matches.slice(-4);
	const opponentTeams = await FeedRepository.findTournamentTeamsByIds(
		lastMatches.flatMap((match) => {
			const opponent =
				match.opponentOne?.id === result.tournamentTeamId
					? match.opponentTwo
					: match.opponentOne;
			return opponent?.id ? [opponent.id] : [];
		}),
	);

	return {
		seriesWin,
		path: lastMatches.map((match) => {
			const own =
				match.opponentOne?.id === result.tournamentTeamId
					? match.opponentOne
					: match.opponentTwo;
			const opponent =
				own === match.opponentOne ? match.opponentTwo : match.opponentOne;

			return {
				opponentName:
					opponentTeams.find((team) => team.id === opponent?.id)?.name ?? "BYE",
				score: [own?.score ?? 0, opponent?.score ?? 0] as const,
				isWin:
					match.winnerSide ===
					(own === match.opponentOne ? "opponent1" : "opponent2"),
			};
		}),
	};
}

async function buildTournamentPodium(ctx: FeedContext) {
	const results = await friendResults(ctx, 14);
	const result =
		results.find(
			(r) => r.placement >= 2 && r.placement <= 3 && r.participantCount >= 60,
		) ?? results.find((r) => r.placement >= 2 && r.placement <= 3);
	if (!result) return null;

	return {
		at: result.startsAt + 6 * HOUR,
		actorKey: String(result.userId),
		data: await resultCard(ctx, result),
	};
}

async function buildTournamentDigest(ctx: FeedContext) {
	const results = R.uniqueBy(
		await friendResults(ctx, 3),
		(result) => result.userId,
	);
	if (results.length < 2) return null;

	const users = await usersById(results.map((result) => result.userId));
	const teams = await tournamentTeamsById(
		results.map((result) => result.tournamentTeamId),
	);

	return {
		at: Math.max(...results.map((result) => result.startsAt)) + 6 * HOUR,
		actorKey: "TO_DIGEST",
		data: {
			tournamentCount: new Set(results.map((result) => result.tournamentId))
				.size,
			rows: R.sortBy(
				results,
				(result) => result.placement / result.participantCount,
			).map((result) => ({
				user: users.get(result.userId)!,
				tournamentId: result.tournamentId,
				tournamentName: result.name,
				teamName: teams.get(result.tournamentTeamId)?.name ?? "",
				placement: result.placement,
				participantCount: result.participantCount,
			})),
		},
	};
}

async function buildTournamentRegistered(ctx: FeedContext) {
	const registrations = (await upcomingRegistrations(ctx)).filter(
		(registration) => ctx.friendIdSet.has(registration.userId),
	);
	const first = registrations.at(0);
	if (!first) return null;

	const sameTournament = registrations.filter(
		(registration) => registration.tournamentId === first.tournamentId,
	);
	const tournament = await tournamentById(first.tournamentId);
	const team = await tournamentTeamById(first.tournamentTeamId);
	const users = await usersById(
		sameTournament.map((registration) => registration.userId),
	);

	return {
		at: Math.max(
			...sameTournament.map((registration) => registration.registeredAt),
		),
		actorKey: String(first.userId),
		data: {
			actor: users.get(first.userId)!,
			friends: sameTournament.map(
				(registration) => users.get(registration.userId)!,
			),
			tournament,
			team,
			teamCount: first.teamCount ?? 0,
		},
	};
}

/** Everyone registered to an upcoming tournament, soonest first */
async function upcomingRegistrations(ctx: FeedContext) {
	const registrations = await FeedCache.cached({
		key: `${ctx.mode}-upcoming-registrations`,
		ttlMs: MINUTE_MS,
		getFreshValue: () => FeedRepository.findAllUpcomingRegistrations(ctx.now),
	});

	return registrations.filter(
		(registration) => registration.startsAt > ctx.now,
	);
}

async function buildTournamentUpset(ctx: FeedContext) {
	const results = await friendResults(ctx, 10);
	const friendIdByTeamId = new Map(
		results.map((result) => [result.tournamentTeamId, result.userId]),
	);

	let best:
		| (TournamentUpset & {
				tournamentId: number;
				friendId: number;
				isFriendWinner: boolean;
		  })
		| null = null;
	for (const tournamentId of R.unique(
		results.map((result) => result.tournamentId),
	)) {
		for (const upset of await tournamentUpsets(tournamentId)) {
			const winnerFriendId = friendIdByTeamId.get(upset.winnerId);
			const friendId = winnerFriendId ?? friendIdByTeamId.get(upset.loserId);
			if (friendId === undefined) continue;
			if (
				best &&
				upset.winnerSeed - upset.loserSeed <= best.winnerSeed - best.loserSeed
			) {
				continue;
			}

			best = {
				...upset,
				tournamentId,
				friendId,
				isFriendWinner: winnerFriendId !== undefined,
			};
		}
	}
	if (!best) return null;

	const tournament = await tournamentById(best.tournamentId);
	const teams = await tournamentTeamsById([best.winnerId, best.loserId]);
	const users = await usersById([best.friendId]);

	return {
		at: (tournament.startsAt ?? ctx.now) + 4 * HOUR,
		actorKey: String(best.friendId),
		data: {
			tournament,
			friend: users.get(best.friendId)!,
			isFriendWinner: best.isFriendWinner,
			winner: teams.get(best.winnerId)!,
			loser: teams.get(best.loserId)!,
			winnerSeed: best.winnerSeed,
			loserSeed: best.loserSeed,
			score: best.score,
		},
	};
}

interface TournamentUpset {
	winnerId: number;
	loserId: number;
	winnerSeed: number;
	loserSeed: number;
	score: readonly [number, number];
}

/** Sets of the tournament won by a team seeded far enough below the loser */
function tournamentUpsets(tournamentId: number) {
	return FeedCache.cached({
		key: `tournament-upsets-${tournamentId}`,
		ttlMs: 10 * MINUTE_MS,
		async getFreshValue() {
			const matches = await FeedRepository.findFinishedMatchesByTournamentIds([
				tournamentId,
			]);
			const seeds = new Map(
				(
					await FeedRepository.findSeedsByTournamentTeamIds(
						R.unique(
							matches.flatMap((match) =>
								[match.opponentOne?.id, match.opponentTwo?.id].filter(
									(id): id is number => typeof id === "number",
								),
							),
						),
					)
				).map((team) => [team.id, team.seed]),
			);

			return matches.flatMap((match): TournamentUpset[] => {
				const { opponentOne: one, opponentTwo: two } = match;
				if (!one?.id || !two?.id) return [];

				const [winner, loser] =
					match.winnerSide === "opponent1" ? [one, two] : [two, one];
				const winnerSeed = seeds.get(winner.id!);
				const loserSeed = seeds.get(loser.id!);
				if (!winnerSeed || !loserSeed) return [];
				if (winnerSeed - loserSeed < FEED_TOURNAMENT_UPSET_MIN_SEED_GAP) {
					return [];
				}

				return [
					{
						winnerId: winner.id!,
						loserId: loser.id!,
						winnerSeed,
						loserSeed,
						score: [winner.score ?? 0, loser.score ?? 0],
					},
				];
			});
		},
	});
}

async function buildTournamentLfg(ctx: SharedFeedContext) {
	const looking = await FeedRepository.findLookingTournamentTeam(ctx.now);
	if (!looking) return null;

	const [team] = await FeedRepository.findTournamentTeamsByIds([looking.id]);
	const [tournament] = await FeedRepository.findTournamentsByIds([
		looking.tournamentId,
	]);

	return {
		at: looking.createdAt,
		actorKey: `tournament-team-${looking.id}`,
		data: {
			team,
			tournament,
			note: looking.lfgNote,
			openSpots: Math.max(1, 4 - team.members.length),
		},
	};
}

async function buildOrganizationTournament(ctx: FeedContext) {
	const playedOrganizationIds = new Set(
		await FeedCache.cached({
			key: `played-organizations-${ctx.viewerId}`,
			ttlMs: HOUR_MS,
			getFreshValue: () =>
				FeedRepository.findOrganizationIdsPlayedByUserId({
					userId: ctx.viewerId,
					after: ctx.now - 365 * DAY,
				}),
		}),
	);
	const announced = await FeedCache.cached({
		key: `${ctx.mode}-announced-organization-tournaments`,
		ttlMs: MINUTE_MS,
		getFreshValue: () =>
			FeedRepository.findAllOrganizationTournamentsAddedAfter(
				ctx.now - FEED_EVENT_MAX_RETENTION_DAYS * DAY,
			),
	});
	const chosen = announced.find(
		(row) =>
			row.createdAt <= ctx.now &&
			row.startsAt > ctx.now &&
			playedOrganizationIds.has(row.organizationId),
	);
	if (chosen) {
		return organizationTournamentItem({
			row: chosen,
			at: chosen.createdAt,
			ctx,
		});
	}
	if (ctx.mode !== "TEST") return null;

	const latest =
		await FeedRepository.findLatestOrganizationTournamentStartingBetween({
			from: ctx.now + 7 * DAY,
			to: ctx.now + 60 * DAY,
		});
	if (!latest) return null;

	return organizationTournamentItem({
		row: latest,
		at: ctx.now - 26 * HOUR,
		ctx,
	});
}

async function organizationTournamentItem({
	row,
	at,
	ctx,
}: {
	row: FeedRepository.OrganizationTournament;
	at: number;
	ctx: FeedContext;
}) {
	const tournament = await tournamentById(row.tournamentId);
	const registrationClosesAt = row.settings.regClosesAt ?? row.startsAt;

	return {
		at,
		actorKey: `organization-${row.organizationSlug}`,
		data: {
			organization: {
				name: row.organizationName,
				slug: row.organizationSlug,
				avatarUrl: row.organizationAvatarUrl,
			},
			tournament,
			teamCount: row.teamCount ?? 0,
			registration: row.settings.isInvitational
				? ("INVITATIONAL" as const)
				: registrationClosesAt > ctx.now
					? ("OPEN" as const)
					: ("CLOSED" as const),
			bracketNames: row.settings.bracketProgression.map(
				(bracket) => bracket.name,
			),
		},
	};
}

async function buildSeriesStandings(ctx: FeedContext) {
	const chosen = R.firstBy(
		(await seriesStandings(ctx)).map((entry) => {
			const friendIndexes = ctx.friendIds.flatMap(
				(friendId) => entry.indexByUserId.get(friendId) ?? [],
			);

			return {
				...entry,
				friendCount: friendIndexes.length,
				friendIndex: Math.min(...friendIndexes),
			};
		}),
		[(entry) => entry.friendCount, "desc"],
	);
	if (!chosen?.friendCount) return null;

	const { standings, friendIndex, latestStartsAt } = chosen;
	const shown = standings.slice(0, 3);
	if (friendIndex > 2) shown.push(standings[friendIndex]);

	const users = await usersById(shown.map((s) => s.userId));
	const organization = await FeedCache.cached({
		key: `organization-${chosen.series.organizationId}`,
		ttlMs: HOUR_MS,
		getFreshValue: () =>
			FeedRepository.findOrganizationById(chosen.series.organizationId),
	});

	return {
		at: latestStartsAt + 6 * HOUR,
		actorKey: `series-${chosen.series.name}`,
		data: {
			seriesName: chosen.series.name,
			organization,
			rows: shown.map((standing) => ({
				placement: standings.indexOf(standing) + 1,
				user: users.get(standing.userId)!,
				points: standing.points,
				eventCount: standing.eventCount,
				isFriend: ctx.friendIdSet.has(standing.userId),
			})),
		},
	};
}

/** Points standings of the last 90 days of every series that shows a leaderboard */
function seriesStandings(ctx: FeedContext) {
	return FeedCache.cached({
		key: `${ctx.mode}-series-standings`,
		ttlMs: 10 * MINUTE_MS,
		async getFreshValue() {
			const allSeries = await FeedRepository.findSeriesWithLeaderboard();
			const result: Array<{
				series: (typeof allSeries)[number];
				standings: Awaited<ReturnType<typeof standingsOfSeries>>["standings"];
				latestStartsAt: number;
				indexByUserId: Map<number, number>;
			}> = [];
			for (const series of allSeries) {
				const { standings, latestStartsAt } = await standingsOfSeries({
					series,
					now: ctx.now,
				});
				if (latestStartsAt === null) continue;

				result.push({
					series,
					standings,
					latestStartsAt,
					indexByUserId: new Map(
						standings.map((standing, index) => [standing.userId, index]),
					),
				});
			}

			return result;
		},
	});
}

async function standingsOfSeries({
	series,
	now,
}: {
	series: { organizationId: number; substringMatches: string[] };
	now: number;
}) {
	const placements = await FeedRepository.findSeriesPlacements({
		organizationId: series.organizationId,
		substringMatches: series.substringMatches,
		from: now - 90 * DAY,
		to: now,
	});

	return {
		standings: R.sortBy(
			Object.entries(R.groupBy(placements, (p) => p.userId)).map(
				([userId, rows]) => ({
					userId: Number(userId),
					points: R.sumBy(rows, (row) => SERIES_POINTS[row.placement] ?? 1),
					eventCount: rows.length,
				}),
			),
			[(standing) => standing.points, "desc"],
		),
		latestStartsAt:
			placements.length > 0
				? Math.max(...placements.map((placement) => placement.startsAt))
				: null,
	};
}

async function buildTournamentVod(ctx: FeedContext) {
	const vod = forViewer(
		ctx,
		(
			await FeedCache.cached({
				key: "latest-tournament-match-vods",
				ttlMs: MINUTE_MS,
				getFreshValue: FeedRepository.findLatestTournamentMatchVods,
			})
		).filter(
			(candidate) =>
				candidate.opponentOne?.id &&
				candidate.opponentTwo?.id &&
				candidate.userId !== null,
		),
		(candidate) => isViewerOrFriend(ctx, candidate.userId!),
	);
	if (!vod?.opponentOne?.id || !vod.opponentTwo?.id || vod.userId === null) {
		return null;
	}

	const [tournament] = await FeedRepository.findTournamentsByIds([
		vod.tournamentId,
	]);
	const teams = await FeedRepository.findTournamentTeamsByIds([
		vod.opponentOne.id,
		vod.opponentTwo.id,
	]);
	const users = await usersById([vod.userId]);

	return {
		at: (tournament.startsAt ?? 0) + 5 * HOUR,
		actorKey: String(vod.userId),
		data: {
			actor: users.get(vod.userId)!,
			tournament,
			teams: [
				teams.find((team) => team.id === vod.opponentOne!.id)!,
				teams.find((team) => team.id === vod.opponentTwo!.id)!,
			] as const,
			score: [vod.opponentOne.score ?? 0, vod.opponentTwo.score ?? 0] as const,
			platform: vod.platform,
			platformVideoId: vod.platformVideoId,
			viewCount: vod.viewCount,
		},
	};
}

async function buildTournamentBadge(ctx: FeedContext) {
	const owners = await FeedCache.cached({
		key: `${ctx.mode}-recent-badge-owners`,
		ttlMs: 10 * MINUTE_MS,
		getFreshValue: () =>
			FeedRepository.findAllTournamentBadgeOwnersStartedAfter(
				ctx.now - FEED_EVENT_MAX_RETENTION_DAYS * DAY,
			),
	});
	const badge = owners.find(
		(owner) => ctx.friendIdSet.has(owner.userId) && owner.startsAt <= ctx.now,
	);
	if (!badge?.tournamentId) return null;

	const tournament = await tournamentById(badge.tournamentId);
	const users = await usersById([badge.userId]);

	return {
		at: badge.startsAt + 6 * HOUR,
		actorKey: String(badge.userId),
		data: {
			actor: users.get(badge.userId)!,
			badge: {
				code: badge.code,
				displayName: badge.displayName,
				hue: badge.hue,
			},
			ownerCount: badge.ownerCount ?? 0,
			tournament,
		},
	};
}

async function buildTrophy(ctx: FeedContext) {
	const owner = forViewer(
		ctx,
		await FeedCache.cached({
			key: "latest-trophy-owners",
			ttlMs: 10 * MINUTE_MS,
			getFreshValue: FeedRepository.findLatestTrophyOwners,
		}),
		(candidate) => ctx.friendIdSet.has(candidate.userId),
	);
	if (!owner) return null;

	const [tournament] = await FeedRepository.findTournamentsByIds([
		owner.tournamentId,
	]);
	const users = await usersById([owner.userId]);

	return {
		at: (tournament?.startsAt ?? 0) + 5 * HOUR,
		actorKey: String(owner.userId),
		data: {
			actor: users.get(owner.userId)!,
			trophy: {
				id: owner.trophyId,
				...R.pick(owner, ["name", "model", "code"]),
			},
			tier: owner.tier,
			tournament,
		},
	};
}

async function buildTournamentShowcase(ctx: SharedFeedContext) {
	const window = FeedSchedule.showcaseWindow(databaseTimestampToDate(ctx.now));
	const tournaments = await ShowcaseTournaments.showcaseTournamentsBetween({
		from: dateToDatabaseTimestamp(window.publishedAt),
		to: dateToDatabaseTimestamp(window.endsAt),
	});
	if (tournaments.length === 0) return null;

	return {
		at: dateToDatabaseTimestamp(window.publishedAt),
		actorKey: "TO_SHOWCASE",
		data: {
			kind: window.kind,
			tournaments: tournaments.map((tournament) =>
				R.pick(tournament, [
					"id",
					"name",
					"logoUrl",
					"startsAt",
					"teamsCount",
					"tier",
					"tentativeTier",
					"organization",
				]),
			),
		},
	};
}

async function buildFeaturedResult(ctx: SharedFeedContext) {
	const candidates = await FeedRepository.findBiggestFinalizedTournaments({
		from: ctx.now - 7 * DAY,
		to: ctx.now,
		limit: 10,
	});
	const featured = candidates.find(
		(candidate) =>
			(candidate.tier !== null &&
				candidate.tier <= FEED_FEATURED_RESULT_MAX_TIER) ||
			candidate.teamCount >= FEED_FEATURED_RESULT_MIN_TEAMS,
	);
	if (!featured) return null;

	return {
		at: featured.startsAt + 6 * HOUR,
		actorKey: `tournament-${featured.tournamentId}`,
		data: await tournamentPodium(featured),
	};
}

async function buildBracketPreview(ctx: FeedContext) {
	const closed = (
		await FeedCache.cached({
			key: `${ctx.mode}-registration-closed-tournaments`,
			ttlMs: MINUTE_MS,
			getFreshValue: () =>
				FeedRepository.findTournamentsWithRegistrationClosedBetween({
					from: ctx.now - 2 * DAY,
					to: ctx.now,
				}),
		})
	).filter(
		(row) =>
			row.regClosesAt >= ctx.now - 2 * DAY &&
			row.regClosesAt <= ctx.now &&
			row.startsAt > ctx.now &&
			row.teamCount >= 2,
	);
	if (closed.length === 0) return null;

	const registeredTournamentIds = new Set(
		(await upcomingRegistrations(ctx))
			.filter(
				(registration) =>
					registration.userId === ctx.viewerId ||
					ctx.friendIdSet.has(registration.userId),
			)
			.map((registration) => registration.tournamentId),
	);
	const chosen =
		closed.find((row) => registeredTournamentIds.has(row.tournamentId)) ??
		R.firstBy(closed, [(row) => row.teamCount, "desc"])!;

	const tournament = await tournamentById(chosen.tournamentId);
	const projected = await projectedSeeding({
		tournamentId: chosen.tournamentId,
		season: ctx.season,
	});

	return {
		at: chosen.regClosesAt,
		actorKey: `tournament-${chosen.tournamentId}`,
		data: {
			tournament,
			teamCount: chosen.teamCount,
			teams: projected.flatMap((entry, index) => {
				const friends = entry.team.members.filter((member) =>
					ctx.friendIdSet.has(member.id),
				);
				const isOwn = entry.team.members.some(
					(member) => member.id === ctx.viewerId,
				);
				if (
					index >= FEED_BRACKET_PREVIEW_TOP_TEAMS &&
					!isOwn &&
					friends.length === 0
				) {
					return [];
				}

				return {
					projectedSeed: index + 1,
					team: entry.team,
					sp: entry.sp,
					isOwn,
					friends,
				};
			}),
		},
	};
}

/** Registered teams of the tournament by the SP of their best members, highest first */
function projectedSeeding({
	tournamentId,
	season,
}: {
	tournamentId: number;
	season: number | null;
}) {
	return FeedCache.cached({
		key: `projected-seeding-${tournamentId}`,
		ttlMs: MINUTE_MS,
		async getFreshValue() {
			const teams =
				await FeedRepository.findRegisteredTeamsByTournamentId(tournamentId);
			const skills =
				season !== null ? (await userSkills(season)).userSkills : {};

			return R.sortBy(
				teams.map((team) => ({
					team,
					sp: projectedTeamSp(
						team.members.map((member) => member.id),
						skills,
					),
				})),
				[(entry) => entry.sp ?? 0, "desc"],
			);
		},
	});
}

async function buildOnThisDay(ctx: SharedFeedContext) {
	const nowDate = databaseTimestampToDate(ctx.now);
	const [row] = await FeedRepository.findBiggestFinalizedTournaments({
		from: 0,
		to: ctx.now - 300 * DAY,
		monthDay: `${String(nowDate.getUTCMonth() + 1).padStart(2, "0")}-${String(nowDate.getUTCDate()).padStart(2, "0")}`,
		limit: 1,
	});
	if (!row) return null;

	return {
		at: dateToDatabaseTimestamp(
			new Date(
				Date.UTC(
					nowDate.getUTCFullYear(),
					nowDate.getUTCMonth(),
					nowDate.getUTCDate(),
				),
			),
		),
		actorKey: `tournament-${row.tournamentId}`,
		data: {
			...(await tournamentPodium(row)),
			yearsAgo:
				nowDate.getUTCFullYear() -
				databaseTimestampToDate(row.startsAt).getUTCFullYear(),
		},
	};
}

async function tournamentPodium({
	tournamentId,
	tier,
	teamCount,
}: {
	tournamentId: number;
	tier: number | null;
	teamCount: number;
}) {
	const [tournament] = await FeedRepository.findTournamentsByIds([
		tournamentId,
	]);
	const podium = R.uniqueBy(
		await FeedRepository.findPodiumTeamIdsByTournamentId(tournamentId),
		(row) => row.placement,
	);
	const teams = await FeedRepository.findTournamentTeamsByIds(
		podium.map((row) => row.tournamentTeamId),
	);

	return {
		tournament,
		tier,
		teamCount,
		podium: podium.map((row) => ({
			placement: row.placement,
			team: teams.find((team) => team.id === row.tournamentTeamId)!,
		})),
	};
}

async function buildTournamentStaff(ctx: FeedContext) {
	const after = ctx.now - 2 * DAY;
	const staff = (
		await FeedCache.cached({
			key: `${ctx.mode}-upcoming-staff`,
			ttlMs: MINUTE_MS,
			getFreshValue: () => FeedRepository.findAllUpcomingStaff(after),
		})
	).find(
		(row) =>
			row.startsAt > after &&
			ctx.friendIdSet.has(row.userId) &&
			(ctx.mode === "TEST" || row.createdAt !== null),
	);
	if (!staff) return null;

	const tournament = await tournamentById(staff.tournamentId);
	const users = await usersById([staff.userId]);

	return {
		at: staff.createdAt ?? ctx.now - 50 * HOUR,
		actorKey: String(staff.userId),
		data: { actor: users.get(staff.userId)!, tournament, role: staff.role },
	};
}

// ---------- Teams & scrims ----------

async function buildTeamJoin(ctx: FeedContext) {
	const join = (
		await FeedCache.cached({
			key: `${ctx.mode}-recent-team-joins`,
			ttlMs: 5 * MINUTE_MS,
			getFreshValue: () =>
				FeedRepository.findAllTeamJoinsAfter(
					ctx.now - RECENT_ACTIVITY_DAYS * DAY,
				),
		})
	).find(
		(candidate) =>
			candidate.createdAt < ctx.now && ctx.friendIdSet.has(candidate.userId),
	);
	if (!join) return null;

	const team = await teamById(join.teamId);
	const users = await usersById([join.userId]);

	return {
		at: join.createdAt,
		actorKey: String(join.userId),
		data: { actor: users.get(join.userId)!, team, role: join.role },
	};
}

async function buildTeamNew(ctx: FeedContext) {
	const created = forViewer(
		ctx,
		(
			await FeedCache.cached({
				key: `${ctx.mode}-recent-teams`,
				ttlMs: 5 * MINUTE_MS,
				getFreshValue: () =>
					FeedRepository.findAllCreatedTeamsAfter(
						ctx.now - RECENT_ACTIVITY_DAYS * DAY,
					),
			})
		).filter((candidate) => candidate.createdAt < ctx.now),
		(candidate) => ctx.friendIdSet.has(candidate.ownerUserId),
	);
	if (!created) return null;

	const [team] = await FeedRepository.findTeamsByIds([created.id]);
	const users = await usersById([created.ownerUserId]);

	return {
		at: created.createdAt,
		actorKey: String(created.ownerUserId),
		data: { actor: users.get(created.ownerUserId)!, team },
	};
}

async function buildTeamAnniversary(ctx: FeedContext) {
	const nowDate = databaseTimestampToDate(ctx.now);
	const membershipsByUserId = await teamMembershipsByUserId();
	const memberships = [ctx.viewerId, ...ctx.friendIds].flatMap(
		(userId) => membershipsByUserId[userId] ?? [],
	);
	const anniversaries = memberships.flatMap((membership) => {
		const anniversary = FeedSchedule.latestAnniversary(
			databaseTimestampToDate(membership.createdAt),
			nowDate,
		);
		return anniversary ? [{ ...membership, ...anniversary }] : [];
	});
	const best = R.firstBy(
		anniversaries,
		[(anniversary) => anniversary.at.getTime(), "desc"],
		[(anniversary) => anniversary.userId === ctx.viewerId, "desc"],
	);
	if (!best) return null;

	const team = await teamById(best.teamId);
	const tournamentCount = await FeedCache.cached({
		key: `team-tournament-count-${best.teamId}`,
		ttlMs: HOUR_MS,
		getFreshValue: () => FeedRepository.countTournamentsByTeamId(best.teamId),
	});

	return {
		at: dateToDatabaseTimestamp(best.at),
		actorKey: `team-${best.teamId}`,
		data: {
			team,
			years: best.years,
			isOwnTeam: team.members.some((member) => member.id === ctx.viewerId),
			tournamentCount,
		},
	};
}

async function buildTeamAvailability(ctx: FeedContext) {
	const viewerTeamIds = await teamIdsOf(ctx, ctx.viewerId);
	const week =
		(await FeedRepository.findLatestTeamAvailabilityWeek({
			before: ctx.now,
			minMembers: 4,
			teamIds: viewerTeamIds,
		})) ??
		(ctx.mode === "TEST"
			? await FeedRepository.findLatestTeamAvailabilityWeek({
					before: ctx.now,
					minMembers: 4,
				})
			: undefined);
	if (!week) return null;

	const slots = await FeedRepository.findAvailabilitySlotsOfTeamWeek({
		teamId: week.teamId,
		weekStartsAt: week.weekStartsAt,
	});
	const freeUsersByHour = new Map<number, Set<number>>();
	for (const slot of slots) {
		for (let hour = slot.startsAt; hour < slot.endsAt; hour += HOUR) {
			const users = freeUsersByHour.get(hour) ?? new Set();
			users.add(slot.userId);
			freeUsersByHour.set(hour, users);
		}
	}
	const best = R.firstBy(
		[...freeUsersByHour.entries()],
		[([, users]) => users.size, "desc"],
		[([hour]) => hour, "asc"],
	);
	if (!best) return null;

	let bestEndsAt = best[0] + HOUR;
	while (freeUsersByHour.get(bestEndsAt)?.size === best[1].size)
		bestEndsAt += HOUR;

	const [team] = await FeedRepository.findTeamsByIds([week.teamId]);
	const days = R.range(0, 7).map((dayIndex) => {
		const dayStartsAt = week.weekStartsAt + dayIndex * DAY;
		return {
			startsAt: dayStartsAt,
			maxFree: Math.max(
				0,
				...R.range(0, 24).map(
					(hour) => freeUsersByHour.get(dayStartsAt + hour * HOUR)?.size ?? 0,
				),
			),
		};
	});

	return {
		at: week.updatedAt,
		actorKey: `team-${week.teamId}`,
		data: {
			team,
			freeCount: best[1].size,
			bestStartsAt: best[0],
			bestEndsAt,
			freeUsers: team.members.filter((member) => best[1].has(member.id)),
			days,
		},
	};
}

async function buildScrimPost(ctx: SharedFeedContext) {
	if (ctx.mode !== "TEST") return null;

	const post = await FeedRepository.findLatestUpcomingScrimPost({
		from: ctx.now,
		to: ctx.now + 2 * DAY,
	});
	if (!post) return null;

	const [team] = await FeedRepository.findTeamsByIds([post.teamId]);

	return {
		at: post.createdAt,
		actorKey: `team-${post.teamId}`,
		data: {
			team,
			startsAt: post.startsAt,
			text: post.text,
			maxDiv: post.maxDiv,
			minDiv: post.minDiv,
			requestCount: post.requestCount ?? 0,
		},
	};
}

async function buildScrimResult(ctx: FeedContext) {
	const scrim =
		(await FeedRepository.findLatestReportedScrim({
			before: ctx.now,
			minMaps: 5,
			teamIds: await teamIdsOf(ctx, ctx.viewerId),
		})) ??
		(ctx.mode === "TEST"
			? await FeedRepository.findLatestReportedScrim({
					before: ctx.now,
					minMaps: 5,
				})
			: undefined);
	if (!scrim) return null;

	const teams = await FeedRepository.findTeamsByIds(
		[scrim.teamId, scrim.opponentTeamId].filter(
			(id): id is number => typeof id === "number",
		),
	);
	return {
		at: scrim.reportedAt ?? ctx.now,
		actorKey: `team-${scrim.teamId}`,
		data: {
			team: teams.find((team) => team.id === scrim.teamId)!,
			opponent: teams.find((team) => team.id === scrim.opponentTeamId) ?? null,
			maps: scrim.maps.map((map) => ({
				mode: map.mode,
				stageId: map.stageId,
			})),
		},
	};
}

async function buildLfgPlayer(ctx: FeedContext) {
	if (!(await hasLfgPostOfType(ctx, "TEAM_FOR_PLAYER"))) return null;

	const post = await FeedRepository.findLatestLFGPost({
		type: "PLAYER_FOR_TEAM",
		before: ctx.now,
	});
	if (!post || post.authorId === ctx.viewerId) return null;

	const users = await usersById([post.authorId]);
	const weapons = await FeedRepository.findWeaponPoolByUserId(post.authorId);

	return {
		at: post.updatedAt,
		actorKey: String(post.authorId),
		data: {
			postId: post.id,
			actor: users.get(post.authorId)!,
			text: post.text,
			timezone: post.timezone,
			weaponSplIds: weapons.map((weapon) => weapon.weaponSplId),
		},
	};
}

async function buildLfgTeam(ctx: FeedContext) {
	if (!(await hasLfgPostOfType(ctx, "PLAYER_FOR_TEAM"))) return null;

	const post = await FeedRepository.findLatestLFGPost({
		type: "TEAM_FOR_PLAYER",
		before: ctx.now,
	});
	if (!post?.teamId || post.authorId === ctx.viewerId) return null;

	const users = await usersById([post.authorId]);
	const [team] = await FeedRepository.findTeamsByIds([post.teamId]);

	return {
		at: post.updatedAt,
		actorKey: `team-${post.teamId}`,
		data: {
			postId: post.id,
			actor: users.get(post.authorId)!,
			team,
			text: post.text,
			timezone: post.timezone,
		},
	};
}

// ---------- Creators ----------

async function buildArtNew(ctx: FeedContext) {
	const from = ctx.now - 7 * DAY;
	const artist = forViewer(
		ctx,
		await FeedCache.cached({
			key: `${ctx.mode}-active-artists`,
			ttlMs: 5 * MINUTE_MS,
			getFreshValue: () =>
				FeedRepository.findAllArtistsActiveBetween({ from, to: ctx.now }),
		}),
		(candidate) => ctx.friendIdSet.has(candidate.authorId),
	);
	if (!artist?.latestAt) return null;

	const pieces = await FeedRepository.findArtPiecesOfAuthorBetween({
		authorId: artist.authorId,
		from,
		to: ctx.now,
	});
	const users = await usersById([artist.authorId]);

	return {
		at: artist.latestAt,
		actorKey: String(artist.authorId),
		data: {
			actor: users.get(artist.authorId)!,
			count: artist.count,
			description:
				pieces.find((piece) => piece.description)?.description ?? null,
			pieces: pieces.map(artPiece),
		},
	};
}

async function buildArtTagged(ctx: FeedContext) {
	const art = forViewer(
		ctx,
		(
			await FeedCache.cached({
				key: `${ctx.mode}-recent-tagged-art`,
				ttlMs: 5 * MINUTE_MS,
				getFreshValue: () =>
					FeedRepository.findAllTaggedArtAfter(
						ctx.now - RECENT_ACTIVITY_DAYS * DAY,
					),
			})
		).filter((candidate) => candidate.createdAt < ctx.now),
		(candidate) => isViewerOrFriend(ctx, candidate.taggedUserId),
	);
	if (!art) return null;

	const users = await usersById([art.authorId, art.taggedUserId]);

	return {
		at: art.createdAt,
		actorKey: String(art.authorId),
		data: {
			actor: users.get(art.authorId)!,
			tagged: users.get(art.taggedUserId)!,
			description: art.description,
			pieces: [artPiece(art)],
		},
	};
}

async function buildArtCommissions(ctx: FeedContext) {
	const artist = forViewer(
		ctx,
		(
			await FeedCache.cached({
				key: `${ctx.mode}-recent-commissions`,
				ttlMs: 5 * MINUTE_MS,
				getFreshValue: () =>
					FeedRepository.findAllOpenedCommissionsAfter(
						ctx.now - RECENT_ACTIVITY_DAYS * DAY,
					),
			})
		).filter((candidate) => candidate.commissionsOpenedAt < ctx.now),
		(candidate) => ctx.friendIdSet.has(candidate.id),
	);
	if (!artist) return null;

	const users = await usersById([artist.id]);

	return {
		at: artist.commissionsOpenedAt,
		actorKey: String(artist.id),
		data: {
			actor: users.get(artist.id)!,
			text: artist.commissionText,
			pieces: artist.pieces.map(artPiece),
		},
	};
}

function artPiece(piece: {
	url: string;
	description: string | null;
	createdAt: number;
}) {
	return {
		url: piece.url,
		description: piece.description,
		createdAt: piece.createdAt,
	};
}

function buildCardById(buildId: number) {
	return FeedCache.cached({
		key: `build-card-${buildId}`,
		ttlMs: 10 * MINUTE_MS,
		async getFreshValue() {
			const build = await FeedRepository.findBuildById(buildId);
			if (!build?.abilities) return null;

			return {
				at: build.updatedAt,
				ownerId: build.ownerId,
				card: await buildCard({ ...build, abilities: build.abilities }),
			};
		},
	});
}

async function buildCard(
	build: NonNullable<
		Awaited<ReturnType<typeof FeedRepository.findBuildById>>
	> & { abilities: BuildAbilitiesTuple },
) {
	const users = await usersById([build.ownerId]);

	return {
		actor: users.get(build.ownerId)!,
		build: {
			id: build.id,
			title: build.title,
			description: build.description,
			modes: build.modes,
			headGearSplId: build.headGearSplId,
			clothesGearSplId: build.clothesGearSplId,
			shoesGearSplId: build.shoesGearSplId,
			abilities: build.abilities,
			updatedAt: build.updatedAt,
			isPrivate: 0 as const,
			weapons: build.weapons.map((weapon) => ({
				weaponSplId: weapon.weaponSplId,
				isTop500: 0,
			})),
		},
		peakXp: build.peakXp ? Math.round(build.peakXp) : null,
	};
}

async function buildBuildNew(ctx: FeedContext) {
	const latest = (
		await FeedCache.cached({
			key: `${ctx.mode}-recent-builds`,
			ttlMs: 5 * MINUTE_MS,
			getFreshValue: () =>
				FeedRepository.findAllPublicBuildIdsUpdatedAfter(
					ctx.now - RECENT_ACTIVITY_DAYS * DAY,
				),
		})
	).find(
		(build) => build.updatedAt < ctx.now && ctx.friendIdSet.has(build.ownerId),
	);
	if (!latest) return null;

	const card = await buildCardById(latest.id);
	if (!card) return null;

	return {
		at: card.at,
		actorKey: String(card.ownerId),
		data: card.card,
	};
}

async function buildBuildForYou(ctx: FeedContext) {
	const weaponPool = await FeedRepository.findWeaponPoolByUserId(ctx.viewerId);
	const weaponSplId = (
		weaponPool.find((weapon) => weapon.isFavorite) ?? weaponPool[0]
	)?.weaponSplId;
	if (weaponSplId === undefined) return null;

	const latest = (
		await FeedCache.cached({
			key: "latest-high-xp-builds",
			ttlMs: 10 * MINUTE_MS,
			getFreshValue: () =>
				FeedRepository.findLatestBuildIdsOfHighXpOwners(3000),
		})
	).find((row) => row.weaponSplId === weaponSplId);
	if (!latest) return null;

	const card = await buildCardById(latest.buildId);
	if (!card) return null;

	return {
		at: card.at,
		actorKey: String(card.ownerId),
		data: { ...card.card, forWeaponSplId: weaponSplId },
	};
}

async function buildVodNew(ctx: SharedFeedContext) {
	const video = await FeedRepository.findLatestValidatedVideo(ctx.now);
	if (!video) return null;

	const players = R.uniqueBy(
		video.matches.flatMap((match) => match.players),
		(player) => player.playerUserId ?? player.playerName,
	).slice(0, 4);
	const users = await usersById(
		players.flatMap((player) =>
			player.playerUserId ? [player.playerUserId] : [],
		),
	);

	return {
		at: video.youtubePublishedAt,
		actorKey: `video-${video.id}`,
		data: {
			videoId: video.id,
			title: video.title,
			type: video.type,
			youtubeId: video.youtubeId,
			matchCount: video.matches.length,
			modes: R.unique(video.matches.map((match) => match.mode)),
			players: players.map((player) => ({
				user: player.playerUserId
					? (users.get(player.playerUserId) ?? null)
					: null,
				name: player.playerName,
				weaponSplId: player.weaponSplId as MainWeaponId,
			})),
		},
	};
}

async function buildXRankTop500(ctx: FeedContext) {
	const placements = await FeedCache.cached({
		key: "latest-x-rank-placements",
		ttlMs: HOUR_MS,
		getFreshValue: FeedRepository.findAllUserPlacementsOfLatestMonth,
	});
	const placement = forViewer(ctx, placements, (candidate) =>
		ctx.friendIdSet.has(candidate.userId),
	);
	if (!placement) return null;

	const users = await usersById([placement.userId]);

	return {
		// results come out once the month is over
		at: dateToDatabaseTimestamp(
			new Date(Date.UTC(placement.year, placement.month, 1)),
		),
		actorKey: String(placement.userId),
		data: {
			actor: users.get(placement.userId)!,
			...R.omit(placement, ["userId"]),
			isFriend: ctx.friendIdSet.has(placement.userId),
		},
	};
}

async function buildScannerScorecard(ctx: FeedContext) {
	const scannedMatches = await FeedCache.cached({
		key: `${ctx.mode}-scanned-matches-with-replay-code`,
		ttlMs: MINUTE_MS,
		getFreshValue: () =>
			FeedRepository.findAllScannedMatchIdsWithReplayCode(ctx.now),
	});
	const latest = forViewer(
		ctx,
		scannedMatches,
		(scanned) =>
			scanned.povUserId !== null && ctx.friendIdSet.has(scanned.povUserId),
	);
	if (!latest) return null;

	const match = await FeedCache.cached({
		key: `scanned-match-${latest.id}`,
		ttlMs: HOUR_MS,
		getFreshValue: () => FeedRepository.findScannedMatchById(latest.id),
	});
	if (!match?.data.pov || !match.data.replayCode || match.povUserId === null) {
		return null;
	}

	const users = await usersById([match.povUserId]);
	const { pov } = match.data;

	return {
		at: match.data.startsAt ?? ctx.now - 2 * HOUR,
		actorKey: String(match.povUserId),
		data: {
			actor: users.get(match.povUserId)!,
			replayCode: match.data.replayCode,
			mode: match.data.mode,
			stageId: match.data.stage,
			isWin: match.data.winner === pov.team,
			matchScores: match.data.matchScores,
			teams: match.data.teams.map((team, teamIndex) =>
				team.players.map((player, playerIndex) => ({
					...R.omit(player, ["abilities"]),
					isPov: teamIndex === pov.team && playerIndex === pov.index,
				})),
			),
		},
	};
}

// ---------- Community ----------

async function buildFriendNew(ctx: FeedContext) {
	const friendship = (
		await FeedCache.cached({
			key: `${ctx.mode}-recent-friendships`,
			ttlMs: MINUTE_MS,
			getFreshValue: () =>
				FeedRepository.findAllFriendshipsCreatedAfter(
					ctx.now - RECENT_ACTIVITY_DAYS * DAY,
				),
		})
	).find(
		(candidate) =>
			candidate.createdAt < ctx.now &&
			candidate.userOneId !== ctx.viewerId &&
			candidate.userTwoId !== ctx.viewerId &&
			(ctx.friendIdSet.has(candidate.userOneId) ||
				ctx.friendIdSet.has(candidate.userTwoId)),
	);
	if (!friendship) return null;

	const friendId = ctx.friendIdSet.has(friendship.userOneId)
		? friendship.userOneId
		: friendship.userTwoId;
	const otherId =
		friendId === friendship.userOneId
			? friendship.userTwoId
			: friendship.userOneId;
	const users = await usersById([friendId, otherId]);

	return {
		at: friendship.createdAt,
		actorKey: String(friendId),
		data: { actor: users.get(friendId)!, other: users.get(otherId)! },
	};
}

async function buildFriendSuggest(ctx: FeedContext) {
	const requestedIds = new Set(
		(await FriendRepository.findPendingSentRequests(ctx.viewerId)).map(
			(request) => request.receiverId,
		),
	);
	const teammate = (
		await FeedCache.cached({
			key: `top-teammates-${ctx.viewerId}`,
			ttlMs: HOUR_MS,
			getFreshValue: () =>
				FeedRepository.findTopTeammatesByUserId(ctx.viewerId),
		})
	).find(
		(candidate) =>
			!ctx.friendIdSet.has(candidate.otherUserId) &&
			!requestedIds.has(candidate.otherUserId),
	);
	if (!teammate) return null;

	const users = await usersById([teammate.otherUserId]);

	return {
		at: dateToDatabaseTimestamp(
			FeedSchedule.latestWeekly(databaseTimestampToDate(ctx.now), {
				weekday: FeedSchedule.WEEKDAY.MONDAY,
			}),
		),
		actorKey: String(teammate.otherUserId),
		data: {
			actor: users.get(teammate.otherUserId)!,
			setWins: teammate.setWins,
			setLosses: teammate.setLosses,
		},
	};
}

async function buildComeback(ctx: FeedContext) {
	const comeback = (await friendEvents(ctx, "COMEBACK")).at(0);
	if (!comeback) return null;

	const users = await usersById([comeback.userId]);
	const { tournamentId } = comeback.data;

	return {
		at: comeback.at,
		actorKey: String(comeback.userId),
		data: {
			actor: users.get(comeback.userId)!,
			breakDays: Math.round((comeback.at - comeback.data.previousAt) / DAY),
			source: comeback.data.source,
			tournament: tournamentId ? await tournamentById(tournamentId) : null,
			setCount: comeback.data.setCount,
			tournamentCount: comeback.data.tournamentCount,
		},
	};
}

async function buildFirstTime(ctx: FeedContext) {
	const first = (await friendEvents(ctx, "FIRST_TIME")).at(0);
	if (!first) return null;

	const users = await usersById([first.userId]);
	const { tournamentId } = first.data;

	return {
		at: first.at,
		actorKey: String(first.userId),
		data: {
			actor: users.get(first.userId)!,
			source: first.data.source,
			tournament: tournamentId ? await tournamentById(tournamentId) : null,
			placement: first.data.placement,
			participantCount: first.data.participantCount,
			setCount: first.data.setCount,
		},
	};
}

async function buildPlusResults(ctx: FeedContext) {
	if (ctx.friendIds.length === 0) return null;

	const nowDate = databaseTimestampToDate(ctx.now);
	const votingRange = Seasons.list
		.map(seasonToVotingRange)
		.findLast((range) => range.endDate < nowDate);
	if (!votingRange) return null;

	const voting = rangeToMonthYear(votingRange);
	const results = await FeedCache.cached({
		key: `plus-results-${voting.year}-${voting.month}`,
		ttlMs: HOUR_MS,
		getFreshValue: () => PlusVotingRepository.findResultsByMonthYear(voting),
	});
	// suggested players were voted on for a tier they weren't in yet
	const promotions = results.flatMap(({ tier, passed }) =>
		passed
			.filter((row) => row.wasSuggested && ctx.friendIdSet.has(row.votedId))
			.map((row) => ({
				user: R.pick(row, ["id", "username", "customUrl", "avatar"]),
				tier,
			})),
	);
	if (promotions.length === 0) return null;

	return {
		at: dateToDatabaseTimestamp(votingRange.endDate),
		actorKey: "PLUS_RESULTS",
		data: { rows: promotions.slice(0, 5) },
	};
}

async function buildAnnouncement(ctx: SharedFeedContext) {
	const nowDate = databaseTimestampToDate(ctx.now);
	const active = FEED_ANNOUNCEMENTS.find(
		(announcement) =>
			new Date(announcement.startsAt) <= nowDate &&
			nowDate < new Date(announcement.endsAt),
	);
	if (active) {
		return {
			at: dateToDatabaseTimestamp(new Date(active.startsAt)),
			actorKey: "ANNOUNCEMENT",
			data: R.omit(active, ["startsAt", "endsAt"]),
		};
	}
	if (ctx.mode !== "TEST") return null;

	return {
		at: ctx.now - 3 * HOUR,
		actorKey: "ANNOUNCEMENT",
		data: FEED_MOCK_ANNOUNCEMENT,
	};
}

async function buildLutiRegistration(ctx: SharedFeedContext) {
	if (!Config.showBannerForSeason && ctx.mode !== "TEST") return null;

	return {
		at:
			ctx.mode === "TEST"
				? ctx.now - (Config.showBannerForSeason ? HOUR : 3 * HOUR)
				: dateToDatabaseTimestamp(
						FeedSchedule.latestWeekly(databaseTimestampToDate(ctx.now), {
							weekday: FeedSchedule.WEEKDAY.MONDAY,
						}),
					),
		actorKey: "LUTI",
		data: {
			season: Config.showBannerForSeason ?? FEED_MOCK_LUTI_SEASON,
			href: LUTI_PAGE,
		},
	};
}

async function buildSiteMilestone(ctx: SharedFeedContext) {
	let best: {
		total: FeedRepository.SiteTotal;
		milestone: number;
		at: number;
	} | null = null;
	for (const total of SITE_TOTALS) {
		const count = await FeedRepository.countSiteTotal({
			total,
			before: ctx.now,
		});
		const milestone = FeedSchedule.reachedMilestone(
			count,
			FEED_SITE_MILESTONE_MIN,
		);
		if (milestone === null) continue;

		const at = await FeedRepository.findNthOfSiteTotal({
			total,
			nth: milestone,
		});
		if (!at || (best && best.at > at)) continue;

		best = { total, milestone, at };
	}
	if (!best) return null;

	return {
		at: best.at,
		actorKey: "SITE_MILESTONE",
		data: { total: best.total, milestone: best.milestone },
	};
}

async function buildFeatureSpotlight(ctx: SharedFeedContext) {
	const publishedAt = FeedSchedule.latestWeekly(
		databaseTimestampToDate(ctx.now),
		{ weekday: FeedSchedule.WEEKDAY.WEDNESDAY },
	);
	const weekNumber = Math.floor(
		dateToDatabaseTimestamp(publishedAt) / (7 * DAY),
	);

	return {
		at: dateToDatabaseTimestamp(publishedAt),
		actorKey: "FEATURE_SPOTLIGHT",
		data: FEED_SPOTLIGHTS[weekNumber % FEED_SPOTLIGHTS.length],
	};
}

async function buildInstallApp(ctx: SharedFeedContext) {
	const nowDate = databaseTimestampToDate(ctx.now);

	return {
		at: dateToDatabaseTimestamp(
			new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1)),
		),
		actorKey: "INSTALL_APP",
		data: {},
	};
}

async function buildSiteUpdate() {
	const entries = allChangelogEntries()
		.filter((entry) => entry.type === "feature")
		.slice(-3)
		.reverse();
	if (entries.length === 0) return null;

	return {
		at: dateToDatabaseTimestamp(new Date(entries[0].addedOn)),
		actorKey: "SITE_UPDATE",
		data: { entries: entries.map((entry) => R.omit(entry, ["addedOn"])) },
	};
}

async function buildRotation(ctx: FeedContext) {
	const usualHours = await FeedCache.cached({
		key: `${ctx.mode}-usual-play-hours-${ctx.viewerId}`,
		ttlMs: HOUR_MS,
		getFreshValue: async () =>
			FeedRotations.usualPlayHours(
				await FeedRepository.findMatchTimesByUserId({
					userId: ctx.viewerId,
					after: ctx.now - FEED_ROTATION_LOOKBACK_WEEKS * 7 * 24 * 60 * 60,
				}),
			),
	});
	const preferences =
		await MatchProfileRepository.findMapModePreferencesByUserId(ctx.viewerId);

	const all = await allRotations();
	const rotations = all.flatMap((rotation) => {
		if (rotation.startsAt <= ctx.now) return [];
		if (!FeedRotations.isDuringUsualHours(rotation, usualHours)) return [];

		const stageIds = [
			rotation.stageId1 as StageId,
			rotation.stageId2 as StageId,
		] as const;
		const matchingStageIds = FeedRotations.matchingStageIds(
			{ mode: rotation.mode, stageIds },
			preferences,
		);
		if (matchingStageIds.length === 0) return [];

		return {
			type: rotation.type,
			mode: rotation.mode,
			stageIds,
			matchingStageIds,
			startsAt: rotation.startsAt,
			endsAt: rotation.endsAt,
		};
	});
	if (rotations.length === 0) return null;

	return {
		// refreshes with every rotation
		at: Math.max(
			...all
				.filter((rotation) => rotation.startsAt <= ctx.now)
				.map((rotation) => rotation.startsAt),
			ctx.now - 2 * HOUR,
		),
		actorKey: "ROTATION",
		data: { rotations: R.sortBy(rotations, (rotation) => rotation.startsAt) },
	};
}

async function buildVoiceRoom(ctx: SharedFeedContext) {
	const room = await FeedRepository.findLatestBusyVoiceRoom(3);
	if (!room) return null;

	const users = await usersById(room.userIds);

	return {
		at: ctx.now - 12 * 60,
		actorKey: String(room.userIds[0]),
		data: {
			roomType: room.roomType,
			userCount: room.userCount,
			users: room.userIds.flatMap((id) => users.get(id) ?? []),
		},
	};
}

async function buildMemory(ctx: FeedContext) {
	const memory = await FeedCache.cached({
		key: `memory-${ctx.viewerId}`,
		ttlMs: HOUR_MS,
		async getFreshValue() {
			const result = await FeedRepository.findFirstTournamentResultByUserId(
				ctx.viewerId,
			);
			if (!result) return null;

			return {
				result,
				tournament: await tournamentById(result.tournamentId),
				team: await tournamentTeamById(result.tournamentTeamId),
			};
		},
	});
	if (!memory) return null;

	const { result, tournament, team } = memory;
	const anniversary = FeedSchedule.latestAnniversary(
		databaseTimestampToDate(result.startsAt),
		databaseTimestampToDate(ctx.now),
	);
	if (!anniversary) return null;

	return {
		at: dateToDatabaseTimestamp(anniversary.at),
		actorKey: "MEMORY",
		data: {
			tournament,
			team,
			placement: result.placement,
			participantCount: result.participantCount,
			yearsAgo: anniversary.years,
		},
	};
}

async function buildCalendarEventNew(ctx: SharedFeedContext) {
	const event = await FeedRepository.findLatestAddedUpcomingCalendarEvent(
		ctx.now,
	);
	if (!event || (event.createdAt === null && ctx.mode !== "TEST")) return null;

	const users = await usersById([event.authorId]);

	return {
		at: event.createdAt ?? ctx.now - 2 * DAY,
		actorKey: String(event.authorId),
		data: {
			actor: users.get(event.authorId)!,
			eventId: event.id,
			name: event.name,
			startsAt: event.startsAt,
			tags: event.tags ?? [],
		},
	};
}

// ---------- helpers ----------

/** "now" of the test page, shortly after the latest SendouQ match so old database snapshots look alive */
async function testNow() {
	const latestMatchAt = await FeedRepository.findLatestGroupMatchCreatedAt();

	return Math.min(
		databaseTimestampNow(),
		latestMatchAt
			? latestMatchAt + NOW_AFTER_LATEST_MATCH_SECONDS
			: databaseTimestampNow(),
	);
}

/** The first candidate meant for the viewer, on the test page the first of anyone's when none is */
function forViewer<T>(
	ctx: SharedFeedContext,
	candidates: T[],
	isForViewer: (candidate: T) => boolean,
) {
	return (
		candidates.find(isForViewer) ??
		(ctx.mode === "TEST" ? candidates.at(0) : undefined)
	);
}

function isViewerOrFriend(ctx: FeedContext, userId: number) {
	return userId === ctx.viewerId || ctx.friendIdSet.has(userId);
}

function teamMembershipsByUserId() {
	return FeedCache.cached({
		key: "team-memberships",
		ttlMs: HOUR_MS,
		getFreshValue: async () =>
			R.groupBy(
				await FeedRepository.findAllTeamMemberships(),
				(membership) => membership.userId,
			),
	});
}

async function teamIdsOf(ctx: FeedContext, userId: number) {
	return memoized(ctx, `team-ids-${userId}`, async () =>
		((await teamMembershipsByUserId())[userId] ?? []).map(
			(membership) => membership.teamId,
		),
	);
}

/** Whether the viewer has an LFG post of the type up, always on the test page */
async function hasLfgPostOfType(
	ctx: FeedContext,
	type: "PLAYER_FOR_TEAM" | "TEAM_FOR_PLAYER",
) {
	if (ctx.mode === "TEST") return true;

	const types = await memoized(ctx, "own-lfg-post-types", () =>
		FeedRepository.findLFGPostTypesByAuthorId(ctx.viewerId),
	);

	return types.includes(type);
}

const SITE_TOTALS: FeedRepository.SiteTotal[] = [
	"USERS",
	"SQ_SETS",
	"TOURNAMENTS",
	"ART",
];

/** Which series of the organization the tournament belongs to and how many times the user has won it, counting this one */
async function seriesWinOf(result: {
	userId: number;
	organizationId: number | null;
	name: string;
	startsAt: number;
}) {
	if (result.organizationId === null) return null;

	const series = (
		await FeedRepository.findSeriesByOrganizationId(result.organizationId)
	).find((s) =>
		s.substringMatches.some((sub) =>
			result.name.toLowerCase().includes(sub.toLowerCase()),
		),
	);
	if (!series) return null;

	return {
		name: series.name,
		count: await FeedRepository.countSeriesWinsOfUser({
			userId: result.userId,
			organizationId: result.organizationId,
			substringMatches: series.substringMatches,
			before: result.startsAt,
		}),
	};
}

/** Average SP of the team's four highest rated members, `null` with fewer than two rated */
function projectedTeamSp(
	memberIds: number[],
	skills: Record<string, { ordinal: number }>,
) {
	const sps = R.sortBy(
		memberIds.flatMap((id) =>
			skills[id] ? [ordinalToSp(skills[id].ordinal)] : [],
		),
		[(sp) => sp, "desc"],
	).slice(0, 4);
	if (sps.length < 2) return null;

	return Math.round(R.sum(sps) / sps.length);
}

const SERIES_POINTS: Record<number, number> = { 1: 10, 2: 7, 3: 5, 4: 4 };

function usersById(userIds: number[]): Promise<Map<number, CommonUser>> {
	return FeedCache.cachedByIds({
		prefix: "user",
		ids: userIds,
		ttlMs: 5 * MINUTE_MS,
		fetch: FeedRepository.findUsersByIds,
		idOf: (user) => user.id,
	});
}

async function tournamentById(tournamentId: number) {
	const tournaments = await FeedCache.cachedByIds({
		prefix: "tournament",
		ids: [tournamentId],
		ttlMs: 5 * MINUTE_MS,
		fetch: FeedRepository.findTournamentsByIds,
		idOf: (tournament) => tournament.tournamentId,
	});

	return tournaments.get(tournamentId)!;
}

function tournamentTeamsById(tournamentTeamIds: number[]) {
	return FeedCache.cachedByIds({
		prefix: "tournament-team",
		ids: tournamentTeamIds,
		ttlMs: MINUTE_MS,
		fetch: FeedRepository.findTournamentTeamsByIds,
		idOf: (team) => team.id,
	});
}

async function tournamentTeamById(tournamentTeamId: number) {
	return (await tournamentTeamsById([tournamentTeamId])).get(tournamentTeamId)!;
}

async function teamById(teamId: number) {
	const teams = await FeedCache.cachedByIds({
		prefix: "team",
		ids: [teamId],
		ttlMs: 5 * MINUTE_MS,
		fetch: FeedRepository.findTeamsByIds,
		idOf: (team) => team.id,
	});

	return teams.get(teamId)!;
}

/** The Splatoon 3 rotations, cached for a minute. */
export function allRotations() {
	return FeedCache.cached({
		key: "rotations",
		ttlMs: MINUTE_MS,
		getFreshValue: SplatoonRotationRepository.findAll,
	});
}

/** The friends' feed events of the type in the last `sinceDays`, newest first */
async function friendEvents<T extends FeedEventType>(
	ctx: FeedContext,
	type: T,
	sinceDays: number = FEED_EVENT_RETENTION_DAYS[type],
) {
	const events = await memoized(ctx, "friend-events", async () =>
		R.sortBy(
			await FeedEventRepository.findAllByUserIds({
				userIds: ctx.friendIds,
				from: ctx.now - FEED_EVENT_MAX_RETENTION_DAYS * DAY,
				to: ctx.now,
			}),
			[(event) => event.at, "desc"],
		),
	);
	const from = ctx.now - sinceDays * DAY;

	return events.filter(
		(event): event is typeof event & { data: FeedEventDataByType[T] } =>
			event.type === type && event.at >= from,
	);
}

function memoized<T>(
	ctx: FeedContext,
	key: string,
	getValue: () => Promise<T>,
): Promise<T> {
	const existing = ctx.memo.get(key);
	if (existing) return existing as Promise<T>;

	const value = getValue();
	ctx.memo.set(key, value);

	return value;
}
