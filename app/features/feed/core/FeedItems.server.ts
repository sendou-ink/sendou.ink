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
import {
	type SkillTierInterval,
	userSkills,
} from "~/features/mmr/tiered.server";
import { lastCompletedVoting } from "~/features/plus-voting/core/voting-time";
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
import * as FeedRepository from "../FeedRepository.server";
import {
	FEED_ANNOUNCEMENTS,
	FEED_BRACKET_PREVIEW_TOP_TEAMS,
	FEED_COMEBACK_MIN_BREAK_DAYS,
	FEED_FEATURED_RESULT_MAX_TIER,
	FEED_FEATURED_RESULT_MIN_TEAMS,
	FEED_LEADERBOARD_TOP_COUNT,
	FEED_MOCK_ANNOUNCEMENT,
	FEED_ROTATION_LOOKBACK_WEEKS,
	FEED_SEASON_COUNTDOWN_DAYS,
	FEED_SITE_MILESTONE_MIN,
	FEED_SPOTLIGHTS,
	FEED_SQ_UPSET_MIN_TIER_STEPS,
	FEED_TOURNAMENT_UPSET_MIN_SEED_GAP,
	type FeedItemType,
	SQ_SET_MILESTONES,
} from "../feed-constants";
import * as FeedRotations from "./FeedRotations";
import * as FeedSchedule from "./FeedSchedule";

const HOUR = 3600;
const DAY = 24 * HOUR;
/** Shortly after the latest SendouQ match, so a database snapshot looks like it's live */
const NOW_AFTER_LATEST_MATCH_SECONDS = 30 * 60;

export interface FeedContext {
	viewerId: number;
	friendIds: number[];
	/** Database timestamp everything is relative to */
	now: number;
	season: number | null;
	previousSeason: number | null;
}

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
		type: T;
		at: number;
		actorKey: string;
		data: FeedItemData<T>;
	};
}[FeedItemType];

/** The feed context of the viewer, with "now" shortly after the latest SendouQ match. */
export async function contextFor(viewerId: number): Promise<FeedContext> {
	const friendIds = await FriendRepository.findFriendIds(viewerId);
	const latestMatchAt = await FeedRepository.findLatestGroupMatchCreatedAt();
	const now = Math.min(
		databaseTimestampNow(),
		latestMatchAt
			? latestMatchAt + NOW_AFTER_LATEST_MATCH_SECONDS
			: databaseTimestampNow(),
	);
	const nowDate = databaseTimestampToDate(now);

	return {
		viewerId,
		friendIds,
		now,
		season: Seasons.currentOrPrevious(nowDate)?.nth ?? null,
		previousSeason: Seasons.previous(nowDate)?.nth ?? null,
	};
}

/** Builds the item of the given type as seen by the viewer of the context, `null` if there is none. */
export async function buildOne(
	type: FeedItemType,
	ctx: FeedContext,
): Promise<FeedItem | null> {
	const built = await BUILDERS[type](ctx);
	if (!built) return null;

	return { type, ...built } as FeedItem;
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
	if (ctx.friendIds.length === 0) return null;

	const promotion = await latestNotablePromotion(ctx);
	const latest = await FeedRepository.findLatestReportedGroupMatchOfUsers({
		userIds: ctx.friendIds,
		from: ctx.now - 10 * DAY,
		to: ctx.now,
	});
	const latestSet = latest
		? await sqSetItem({ matchId: latest.matchId, userId: latest.userId })
		: null;
	const latestUpset = latestSet?.data.isUpset ? latestSet : null;

	if (promotion && (!latestUpset || promotion.at >= latestUpset.at)) {
		return sqSetItem({
			matchId: promotion.groupMatchId,
			userId: promotion.userId,
			promotion: { from: promotion.from, to: promotion.to },
		});
	}

	return latestUpset;
}

/** Latest set that moved a friend up to a tier at least as high as their tier last season. */
async function latestNotablePromotion(ctx: FeedContext) {
	if (ctx.season === null) return null;

	const { intervals } = await userSkills(ctx.season);
	const lastSeasonSkills =
		ctx.previousSeason === null
			? {}
			: (await userSkills(ctx.previousSeason)).userSkills;
	const typicalTierRank = (userId: number) => {
		const skill = lastSeasonSkills[userId];
		return skill && !skill.approximate ? tierRank(skill.tier) : -1;
	};

	const skills = await FeedRepository.findSeasonGroupMatchSkillsByUserIds({
		userIds: ctx.friendIds,
		season: ctx.season,
	});

	let best: {
		userId: number;
		groupMatchId: number;
		at: number;
		from: ReturnType<typeof tierOf>;
		to: ReturnType<typeof tierOf>;
	} | null = null;
	for (const [userId, userSkillRows] of Object.entries(
		R.groupBy(skills, (skill) => skill.userId),
	)) {
		for (let i = 1; i < userSkillRows.length; i++) {
			const current = userSkillRows[i];
			if (current.createdAt === null || current.createdAt >= ctx.now) break;
			if (current.groupMatchId === null) continue;

			const from = tierOf(intervals, userSkillRows[i - 1].ordinal);
			const to = tierOf(intervals, current.ordinal);
			if (tierRank(to) <= tierRank(from)) continue;
			if (tierRank(to) < typicalTierRank(Number(userId))) continue;
			if (best && best.at > current.createdAt) continue;

			best = {
				userId: Number(userId),
				groupMatchId: current.groupMatchId,
				at: current.createdAt,
				from,
				to,
			};
		}
	}

	return best;
}

async function sqSetItem({
	matchId,
	userId,
	promotion = null,
}: {
	matchId: number;
	userId: number;
	promotion?: {
		from: ReturnType<typeof tierOf>;
		to: ReturnType<typeof tierOf>;
	} | null;
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
				tierRank(opponentTier) - tierRank(ownTier) >=
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
	const results = await FeedRepository.findGroupMatchResultsByUserIds({
		userIds: ctx.friendIds,
		from: ctx.now - 30 * DAY,
		to: ctx.now,
	});

	let best: { userId: number; streak: number; at: number } | null = null;
	for (const [userId, userResults] of Object.entries(
		R.groupBy(results, (result) => result.userId),
	)) {
		let streak = 0;
		for (const result of userResults) {
			const mapWins = result.mapWins ?? 0;
			const mapsPlayed = result.mapsPlayed ?? 0;
			if (mapWins <= mapsPlayed - mapWins) break;
			streak++;
		}
		if (streak >= 3 && (!best || streak > best.streak)) {
			best = { userId: Number(userId), streak, at: userResults[0].createdAt };
		}
	}
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
			streak: best.streak,
			sp: skill ? ordinalToSp(skill.ordinal) : null,
			tier: skill?.tier ?? null,
		},
	};
}

async function buildSqLeaderboard(ctx: FeedContext) {
	if (ctx.season === null) return null;

	const leaderboard = await cachedFullUserLeaderboard(ctx.season);
	const index = leaderboard.findIndex((candidate) =>
		ctx.friendIds.includes(candidate.id),
	);
	if (index === -1) return null;

	const entry = leaderboard[index];

	return {
		at: ctx.now - 5 * HOUR,
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
	const times = await FeedRepository.findGroupMatchTimesByUserIds(
		ctx.friendIds,
	);

	let best: {
		userId: number;
		milestone: number;
		at: number;
		since: number;
	} | null = null;
	for (const [userId, userTimes] of Object.entries(
		R.groupBy(times, (time) => time.userId),
	)) {
		for (const milestone of SQ_SET_MILESTONES) {
			const reachedAt = userTimes[milestone - 1]?.createdAt;
			if (!reachedAt || reachedAt < ctx.now - 60 * DAY || reachedAt > ctx.now)
				continue;
			if (best && best.at > reachedAt) continue;

			best = {
				userId: Number(userId),
				milestone,
				at: reachedAt,
				since: userTimes[0].createdAt,
			};
		}
	}
	if (!best) return null;

	const users = await usersById([best.userId]);

	return {
		at: best.at,
		actorKey: String(best.userId),
		data: {
			actor: users.get(best.userId)!,
			milestone: best.milestone,
			since: best.since,
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
				tierRank(skill.tier) < tierRank(candidate.tier)
			);
		});
	const entry = leaderboard.find(
		(e) => ctx.friendIds.includes(e.id) && isNewPeak(e),
	);
	if (!entry) return null;

	const mapResults = await FeedRepository.findMapResultsByUserId({
		userId: entry.id,
		season: ctx.previousSeason,
	});
	const playedEnough = mapResults.filter(
		(result) => result.wins + result.losses >= 6,
	);
	const winRate = (result: (typeof mapResults)[number]) =>
		result.wins / (result.wins + result.losses);
	const bestMap = R.firstBy(playedEnough, [winRate, "desc"]);
	const worstMap = R.firstBy(playedEnough, [winRate, "asc"]);

	return {
		at: ctx.now - 40 * HOUR,
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
	if (ctx.season === null || ctx.friendIds.length === 0) return null;

	const rivalry = await FeedRepository.findTopCloseRivalryOfUsers({
		userIds: ctx.friendIds,
		season: ctx.season,
	});
	if (!rivalry) return null;

	const users = await usersById([rivalry.ownerUserId, rivalry.otherUserId]);

	return {
		at: ctx.now - 20 * HOUR,
		actorKey: String(rivalry.ownerUserId),
		data: {
			actor: users.get(rivalry.ownerUserId)!,
			other: users.get(rivalry.otherUserId)!,
			sets: [rivalry.setWins, rivalry.setLosses] as const,
			maps: [rivalry.mapWins, rivalry.mapLosses] as const,
		},
	};
}

async function buildSqSeasonStart(ctx: FeedContext) {
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

async function buildLeaderboardTop(ctx: FeedContext) {
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

async function buildSqMeta(ctx: FeedContext) {
	const thisWeek = await FeedRepository.findWeaponUsageCounts({
		from: ctx.now - 7 * DAY,
		to: ctx.now,
	});
	const lastWeek = await FeedRepository.findWeaponUsageCounts({
		from: ctx.now - 14 * DAY,
		to: ctx.now - 7 * DAY,
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
		at: ctx.now - 9 * HOUR,
		actorKey: "SQ_META",
		data: {
			rising: changes.slice(0, 3),
			falling: changes.slice(-2).reverse(),
			reportCount: totalThisWeek,
		},
	};
}

async function buildLobbyRecap(ctx: FeedContext) {
	const lobby = await FeedRepository.findLatestEndedLobbyOfUsers(ctx.friendIds);
	if (!lobby?.endedAt) return null;

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

async function buildStreamLive(ctx: FeedContext) {
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
	return FeedRepository.findTournamentResultsByUserIds({
		userIds: ctx.friendIds,
		from: ctx.now - sinceDays * DAY,
		to: ctx.now,
	});
}

async function resultCard(
	ctx: FeedContext,
	result: Awaited<ReturnType<typeof friendResults>>[number],
) {
	const [tournament] = await FeedRepository.findTournamentsByIds([
		result.tournamentId,
	]);
	const [team] = await FeedRepository.findTournamentTeamsByIds([
		result.tournamentTeamId,
	]);
	const users = await usersById([result.userId]);

	return {
		actor: users.get(result.userId)!,
		tournament,
		team,
		placement: result.placement,
		participantCount: result.participantCount,
		setWins: result.setResults.filter((set) => set === "W").length,
		setLosses: result.setResults.filter((set) => set === "L").length,
		friendsOnTeam: team.members.filter(
			(member) =>
				ctx.friendIds.includes(member.id) && member.id !== result.userId,
		),
	};
}

async function buildTournamentWin(ctx: FeedContext) {
	const result = (await friendResults(ctx, 14)).find(
		(r) => r.placement === 1 && r.participantCount >= 12,
	);
	if (!result) return null;

	const card = await resultCard(ctx, result);
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
		at: result.startsAt + 6 * HOUR,
		actorKey: String(result.userId),
		data: {
			...card,
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
						opponentTeams.find((team) => team.id === opponent?.id)?.name ??
						"BYE",
					score: [own?.score ?? 0, opponent?.score ?? 0] as const,
					isWin:
						match.winnerSide ===
						(own === match.opponentOne ? "opponent1" : "opponent2"),
				};
			}),
		},
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
	const teams = await FeedRepository.findTournamentTeamsByIds(
		results.map((result) => result.tournamentTeamId),
	);

	return {
		at: ctx.now - HOUR,
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
				teamName:
					teams.find((team) => team.id === result.tournamentTeamId)?.name ?? "",
				placement: result.placement,
				participantCount: result.participantCount,
			})),
		},
	};
}

async function buildTournamentRegistered(ctx: FeedContext) {
	const registrations = await FeedRepository.findUpcomingRegistrationsByUserIds(
		{
			userIds: ctx.friendIds,
			after: ctx.now,
		},
	);
	const first = registrations[0];
	if (!first) return null;

	const sameTournament = registrations.filter(
		(registration) => registration.tournamentId === first.tournamentId,
	);
	const [tournament] = await FeedRepository.findTournamentsByIds([
		first.tournamentId,
	]);
	const [team] = await FeedRepository.findTournamentTeamsByIds([
		first.tournamentTeamId,
	]);
	const users = await usersById(
		sameTournament.map((registration) => registration.userId),
	);

	return {
		at: ctx.now - 14 * HOUR,
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

async function buildTournamentUpset(ctx: FeedContext) {
	const results = await friendResults(ctx, 10);
	const friendIdByTeamId = new Map(
		results.map((result) => [result.tournamentTeamId, result.userId]),
	);
	const matches = await FeedRepository.findFinishedMatchesByTournamentIds(
		R.unique(results.map((result) => result.tournamentId)),
	);
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

	let best: {
		tournamentId: number;
		winnerId: number;
		loserId: number;
		winnerSeed: number;
		loserSeed: number;
		score: readonly [number, number];
		friendId: number;
		isFriendWinner: boolean;
	} | null = null;
	for (const match of matches) {
		const { opponentOne: one, opponentTwo: two } = match;
		if (!one?.id || !two?.id) continue;

		const [winner, loser] =
			match.winnerSide === "opponent1" ? [one, two] : [two, one];
		const winnerFriendId = friendIdByTeamId.get(winner.id!);
		const friendId = winnerFriendId ?? friendIdByTeamId.get(loser.id!);
		if (friendId === undefined) continue;

		const winnerSeed = seeds.get(winner.id!);
		const loserSeed = seeds.get(loser.id!);
		if (!winnerSeed || !loserSeed) continue;
		if (winnerSeed - loserSeed < FEED_TOURNAMENT_UPSET_MIN_SEED_GAP) continue;
		if (best && winnerSeed - loserSeed <= best.winnerSeed - best.loserSeed)
			continue;

		best = {
			tournamentId: match.tournamentId,
			winnerId: winner.id!,
			loserId: loser.id!,
			winnerSeed,
			loserSeed,
			score: [winner.score ?? 0, loser.score ?? 0],
			friendId,
			isFriendWinner: winnerFriendId !== undefined,
		};
	}
	if (!best) return null;

	const [tournament] = await FeedRepository.findTournamentsByIds([
		best.tournamentId,
	]);
	const teams = await FeedRepository.findTournamentTeamsByIds([
		best.winnerId,
		best.loserId,
	]);
	const users = await usersById([best.friendId]);

	return {
		at: (tournament.startsAt ?? ctx.now) + 4 * HOUR,
		actorKey: String(best.friendId),
		data: {
			tournament,
			friend: users.get(best.friendId)!,
			isFriendWinner: best.isFriendWinner,
			winner: teams.find((team) => team.id === best.winnerId)!,
			loser: teams.find((team) => team.id === best.loserId)!,
			winnerSeed: best.winnerSeed,
			loserSeed: best.loserSeed,
			score: best.score,
		},
	};
}

async function buildTournamentLfg(ctx: FeedContext) {
	const looking = await FeedRepository.findLookingTournamentTeam(ctx.now);
	if (!looking) return null;

	const [team] = await FeedRepository.findTournamentTeamsByIds([looking.id]);
	const [tournament] = await FeedRepository.findTournamentsByIds([
		looking.tournamentId,
	]);

	return {
		at: ctx.now - 3 * HOUR,
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
	const row =
		await FeedRepository.findLatestOrganizationTournamentStartingBetween({
			from: ctx.now + 7 * DAY,
			to: ctx.now + 60 * DAY,
		});
	if (!row) return null;

	const [tournament] = await FeedRepository.findTournamentsByIds([
		row.tournamentId,
	]);

	return {
		at: ctx.now - 26 * HOUR,
		actorKey: `organization-${row.organizationSlug}`,
		data: {
			organization: {
				name: row.organizationName,
				slug: row.organizationSlug,
				avatarUrl: row.organizationAvatarUrl,
			},
			tournament,
			teamCount: row.teamCount ?? 0,
			bracketNames: row.settings.bracketProgression.map(
				(bracket) => bracket.name,
			),
		},
	};
}

async function buildSeriesStandings(ctx: FeedContext) {
	const series = await FeedRepository.findSeriesWithLeaderboard();
	const results = await friendResults(ctx, 120);

	const seriesOf = (result: (typeof results)[number]) =>
		series.find(
			(s) =>
				s.organizationId === result.organizationId &&
				s.substringMatches.some((sub) =>
					result.name.toLowerCase().includes(sub.toLowerCase()),
				),
		);
	const favorite = R.firstBy(
		Object.entries(
			R.groupBy(
				results.filter((result) => seriesOf(result)),
				(result) => seriesOf(result)!.name,
			),
		),
		[([, rows]) => rows.length, "desc"],
	);
	if (!favorite) return null;
	const chosen = seriesOf(favorite[1][0])!;

	const placements = await FeedRepository.findSeriesPlacements({
		organizationId: chosen.organizationId,
		substringMatches: chosen.substringMatches,
		from: ctx.now - 90 * DAY,
		to: ctx.now,
	});
	const standings = R.sortBy(
		Object.entries(R.groupBy(placements, (p) => p.userId)).map(
			([userId, rows]) => ({
				userId: Number(userId),
				points: R.sumBy(rows, (row) => SERIES_POINTS[row.placement] ?? 1),
				eventCount: rows.length,
			}),
		),
		[(standing) => standing.points, "desc"],
	);
	const friendIndex = standings.findIndex((s) =>
		ctx.friendIds.includes(s.userId),
	);
	const shown = standings.slice(0, 3);
	if (friendIndex > 2) shown.push(standings[friendIndex]);

	const users = await usersById(shown.map((s) => s.userId));
	const organization = await FeedRepository.findOrganizationById(
		chosen.organizationId,
	);

	return {
		at: ctx.now - 15 * HOUR,
		actorKey: `series-${chosen.name}`,
		data: {
			seriesName: chosen.name,
			organization,
			rows: shown.map((standing) => ({
				placement: standings.indexOf(standing) + 1,
				user: users.get(standing.userId)!,
				points: standing.points,
				eventCount: standing.eventCount,
				isFriend: ctx.friendIds.includes(standing.userId),
			})),
		},
	};
}

async function buildTournamentVod() {
	const vod = await FeedRepository.findLatestTournamentMatchVod();
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
	const badge = await FeedRepository.findLatestTournamentBadgeOfUsers(
		ctx.friendIds,
	);
	if (!badge?.tournamentId) return null;

	const [tournament] = await FeedRepository.findTournamentsByIds([
		badge.tournamentId,
	]);
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

async function buildTrophy() {
	const owner = await FeedRepository.findLatestTrophyOwner();
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
			trophyId: owner.trophyId,
			trophyName: owner.name,
			tier: owner.tier,
			tournament,
		},
	};
}

async function buildTournamentShowcase(ctx: FeedContext) {
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

async function buildFeaturedResult(ctx: FeedContext) {
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
		await FeedRepository.findTournamentsWithRegistrationClosedBetween({
			from: ctx.now - 2 * DAY,
			to: ctx.now,
		})
	).filter((row) => row.startsAt > ctx.now && row.teamCount >= 2);
	if (closed.length === 0) return null;

	const viewerAndFriendIds = [ctx.viewerId, ...ctx.friendIds];
	const registeredTournamentIds = new Set(
		(
			await FeedRepository.findUpcomingRegistrationsByUserIds({
				userIds: viewerAndFriendIds,
				after: ctx.now,
			})
		).map((registration) => registration.tournamentId),
	);
	const chosen =
		closed.find((row) => registeredTournamentIds.has(row.tournamentId)) ??
		R.firstBy(closed, [(row) => row.teamCount, "desc"])!;

	const [tournament] = await FeedRepository.findTournamentsByIds([
		chosen.tournamentId,
	]);
	const teams = await FeedRepository.findRegisteredTeamsByTournamentId(
		chosen.tournamentId,
	);
	const skills =
		ctx.season !== null ? (await userSkills(ctx.season)).userSkills : {};
	const projected = R.sortBy(
		teams.map((team) => ({
			team,
			sp: projectedTeamSp(
				team.members.map((member) => member.id),
				skills,
			),
		})),
		[(entry) => entry.sp ?? 0, "desc"],
	);

	return {
		at: chosen.regClosesAt,
		actorKey: `tournament-${chosen.tournamentId}`,
		data: {
			tournament,
			teamCount: chosen.teamCount,
			teams: projected.flatMap((entry, index) => {
				const friends = entry.team.members.filter((member) =>
					ctx.friendIds.includes(member.id),
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

async function buildOnThisDay(ctx: FeedContext) {
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
	const staff = await FeedRepository.findUpcomingStaffOfUsers({
		userIds: ctx.friendIds,
		after: ctx.now - 2 * DAY,
	});
	if (!staff) return null;

	const [tournament] = await FeedRepository.findTournamentsByIds([
		staff.tournamentId,
	]);
	const users = await usersById([staff.userId]);

	return {
		at: ctx.now - 50 * HOUR,
		actorKey: String(staff.userId),
		data: { actor: users.get(staff.userId)!, tournament, role: staff.role },
	};
}

// ---------- Teams & scrims ----------

async function buildTeamJoin(ctx: FeedContext) {
	const join = await FeedRepository.findLatestTeamJoinOfUsers({
		userIds: ctx.friendIds,
		before: ctx.now,
	});
	if (!join) return null;

	const [team] = await FeedRepository.findTeamsByIds([join.teamId]);
	const users = await usersById([join.userId]);

	return {
		at: join.createdAt,
		actorKey: String(join.userId),
		data: { actor: users.get(join.userId)!, team, role: join.role },
	};
}

async function buildTeamNew(ctx: FeedContext) {
	const created = await FeedRepository.findLatestCreatedTeam(ctx.now);
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
	const memberships = await FeedRepository.findTeamMembershipsOfUsers([
		ctx.viewerId,
		...ctx.friendIds,
	]);
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

	const [team] = await FeedRepository.findTeamsByIds([best.teamId]);

	return {
		at: dateToDatabaseTimestamp(best.at),
		actorKey: `team-${best.teamId}`,
		data: {
			team,
			years: best.years,
			isOwnTeam: team.members.some((member) => member.id === ctx.viewerId),
			tournamentCount: await FeedRepository.countTournamentsByTeamId(
				best.teamId,
			),
		},
	};
}

async function buildTeamAvailability(ctx: FeedContext) {
	const week = await FeedRepository.findLatestTeamAvailabilityWeek({
		before: ctx.now,
		minMembers: 4,
	});
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
		at: ctx.now - 6 * HOUR,
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

async function buildScrimPost(ctx: FeedContext) {
	const post = await FeedRepository.findLatestUpcomingScrimPost({
		from: ctx.now,
		to: ctx.now + 2 * DAY,
	});
	if (!post) return null;

	const [team] = await FeedRepository.findTeamsByIds([post.teamId]);

	return {
		at: ctx.now - 70 * 60,
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
	const scrim = await FeedRepository.findLatestReportedScrim({
		before: ctx.now,
		minMaps: 5,
	});
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
	const post = await FeedRepository.findLatestLFGPost({
		type: "PLAYER_FOR_TEAM",
		before: ctx.now,
	});
	if (!post) return null;

	const users = await usersById([post.authorId]);
	const weapons = await FeedRepository.findWeaponPoolByUserId(post.authorId);

	return {
		at: post.updatedAt,
		actorKey: String(post.authorId),
		data: {
			actor: users.get(post.authorId)!,
			text: post.text,
			timezone: post.timezone,
			weaponSplIds: weapons.map((weapon) => weapon.weaponSplId),
		},
	};
}

async function buildLfgTeam(ctx: FeedContext) {
	const post = await FeedRepository.findLatestLFGPost({
		type: "TEAM_FOR_PLAYER",
		before: ctx.now,
	});
	if (!post?.teamId) return null;

	const users = await usersById([post.authorId]);
	const [team] = await FeedRepository.findTeamsByIds([post.teamId]);

	return {
		at: post.updatedAt,
		actorKey: `team-${post.teamId}`,
		data: {
			actor: users.get(post.authorId)!,
			team,
			text: post.text,
			timezone: post.timezone,
		},
	};
}

// ---------- Creators ----------

async function buildArtNew(ctx: FeedContext) {
	const artist = await FeedRepository.findMostActiveArtist({
		from: ctx.now - 7 * DAY,
		to: ctx.now,
	});
	if (!artist?.latestAt) return null;

	const users = await usersById([artist.authorId]);

	return {
		at: artist.latestAt,
		actorKey: String(artist.authorId),
		data: {
			actor: users.get(artist.authorId)!,
			count: artist.count,
			description:
				artist.pieces.find((piece) => piece.description)?.description ?? null,
			pieces: artist.pieces.map(artPiece),
		},
	};
}

async function buildArtTagged(ctx: FeedContext) {
	const art = await FeedRepository.findLatestTaggedArt(ctx.now);
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
	const artist = await FeedRepository.findLatestOpenedCommissions(ctx.now);
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

async function buildCard(
	build: NonNullable<
		Awaited<ReturnType<typeof FeedRepository.findLatestBuild>>
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
	const build = await FeedRepository.findLatestBuild({
		ownerIds: ctx.friendIds,
		before: ctx.now,
	});
	if (!build?.abilities) return null;

	return {
		at: build.updatedAt,
		actorKey: String(build.ownerId),
		data: await buildCard({ ...build, abilities: build.abilities }),
	};
}

async function buildBuildForYou(ctx: FeedContext) {
	const weaponPool = await FeedRepository.findWeaponPoolByUserId(ctx.viewerId);
	const weaponSplId = (
		weaponPool.find((weapon) => weapon.isFavorite) ?? weaponPool[0]
	)?.weaponSplId;
	if (weaponSplId === undefined) return null;

	const build = await FeedRepository.findLatestBuild({
		weaponSplId,
		minPeakXp: 3000,
		before: ctx.now,
	});
	if (!build?.abilities) return null;

	return {
		at: build.updatedAt,
		actorKey: String(build.ownerId),
		data: {
			...(await buildCard({ ...build, abilities: build.abilities })),
			forWeaponSplId: weaponSplId,
		},
	};
}

async function buildVodNew(ctx: FeedContext) {
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
	const placement = await FeedRepository.findBestLatestXRankPlacement(
		ctx.friendIds,
	);
	if (!placement) return null;

	const users = await usersById([placement.userId]);

	return {
		at: ctx.now - 3 * DAY,
		actorKey: String(placement.userId),
		data: {
			actor: users.get(placement.userId)!,
			...R.omit(placement, ["userId"]),
			isFriend: ctx.friendIds.includes(placement.userId),
		},
	};
}

async function buildScannerScorecard(ctx: FeedContext) {
	const match = await FeedRepository.findLatestScannedMatchWithReplayCode({
		userIds: ctx.friendIds,
		before: ctx.now,
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
	const friendship = await FeedRepository.findLatestFriendshipOfUsers({
		userIds: ctx.friendIds,
		excludedUserId: ctx.viewerId,
		before: ctx.now,
	});
	if (!friendship) return null;

	const friendId = ctx.friendIds.includes(friendship.userOneId)
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
	const teammate = await FeedRepository.findTopTeammateByUserId({
		userId: ctx.viewerId,
		excludedUserIds: ctx.friendIds,
	});
	if (!teammate) return null;

	const users = await usersById([teammate.otherUserId]);

	return {
		at: ctx.now - 22 * HOUR,
		actorKey: String(teammate.otherUserId),
		data: {
			actor: users.get(teammate.otherUserId)!,
			setWins: teammate.setWins,
			setLosses: teammate.setLosses,
		},
	};
}

async function buildComeback(ctx: FeedContext) {
	const plays = await friendPlays(ctx);
	const comeback = plays
		.filter(
			(play) =>
				play.previousAt !== null &&
				play.at - play.previousAt >= FEED_COMEBACK_MIN_BREAK_DAYS * DAY,
		)
		.at(-1);
	if (!comeback) return null;

	const playsSince = plays.filter(
		(play) => play.userId === comeback.userId && play.at >= comeback.at,
	);
	const users = await usersById([comeback.userId]);
	const [tournament] = comeback.tournamentId
		? await FeedRepository.findTournamentsByIds([comeback.tournamentId])
		: [];

	return {
		at: comeback.at,
		actorKey: String(comeback.userId),
		data: {
			actor: users.get(comeback.userId)!,
			breakDays: Math.round((comeback.at - comeback.previousAt!) / DAY),
			source: comeback.source,
			tournament: tournament ?? null,
			setCount: playsSince.filter((play) => play.source === "SQ").length,
			tournamentCount: playsSince.filter((play) => play.source === "TOURNAMENT")
				.length,
		},
	};
}

async function buildFirstTime(ctx: FeedContext) {
	const plays = await friendPlays(ctx);
	const first = plays.filter((play) => play.previousOfSourceAt === null).at(-1);
	if (!first) return null;

	const users = await usersById([first.userId]);
	const tournamentResult =
		first.source === "TOURNAMENT"
			? await FeedRepository.findFirstTournamentResultByUserId(first.userId)
			: null;
	const [tournament] = tournamentResult
		? await FeedRepository.findTournamentsByIds([tournamentResult.tournamentId])
		: [];

	return {
		at: first.at,
		actorKey: String(first.userId),
		data: {
			actor: users.get(first.userId)!,
			source: first.source,
			tournament: tournament ?? null,
			placement: tournamentResult?.placement ?? null,
			participantCount: tournamentResult?.participantCount ?? null,
			setCount: plays.filter(
				(play) =>
					play.userId === first.userId &&
					play.source === "SQ" &&
					play.at >= first.at,
			).length,
		},
	};
}

function friendPlays(ctx: FeedContext) {
	return FeedRepository.findPlaysOfUsersBetween({
		userIds: ctx.friendIds,
		from: ctx.now - 30 * DAY,
		to: ctx.now,
	});
}

async function buildPlusResults(ctx: FeedContext) {
	if (ctx.friendIds.length === 0) return null;

	const voting = lastCompletedVoting(databaseTimestampToDate(ctx.now));
	const results = await PlusVotingRepository.findResultsByMonthYear(voting);
	// suggested players were voted on for a tier they weren't in yet
	const promotions = results.flatMap(({ tier, passed }) =>
		passed
			.filter((row) => row.wasSuggested && ctx.friendIds.includes(row.votedId))
			.map((row) => ({
				user: R.pick(row, ["id", "username", "customUrl", "avatar"]),
				tier,
			})),
	);
	if (promotions.length === 0) return null;

	return {
		at: ctx.now - 2 * DAY,
		actorKey: "PLUS_RESULTS",
		data: { rows: promotions.slice(0, 5) },
	};
}

async function buildAnnouncement(ctx: FeedContext) {
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

	if (Config.showBannerForSeason) {
		return {
			at: ctx.now - HOUR,
			actorKey: "ANNOUNCEMENT",
			data: {
				...FEED_MOCK_ANNOUNCEMENT,
				title: `Registration is open for LUTI Season ${Config.showBannerForSeason}`,
				href: LUTI_PAGE,
			},
		};
	}

	return {
		at: ctx.now - 3 * HOUR,
		actorKey: "ANNOUNCEMENT",
		data: FEED_MOCK_ANNOUNCEMENT,
	};
}

async function buildSiteMilestone(ctx: FeedContext) {
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

async function buildFeatureSpotlight(ctx: FeedContext) {
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

async function buildInstallApp(ctx: FeedContext) {
	const nowDate = databaseTimestampToDate(ctx.now);

	return {
		at: dateToDatabaseTimestamp(
			new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1)),
		),
		actorKey: "INSTALL_APP",
		data: {},
	};
}

async function buildSiteUpdate(ctx: FeedContext) {
	const entries = allChangelogEntries()
		.filter((entry) => entry.type === "feature")
		.slice(-3)
		.reverse();
	if (entries.length === 0) return null;

	return {
		at: ctx.now - 20 * HOUR,
		actorKey: "SITE_UPDATE",
		data: { entries },
	};
}

async function buildRotation(ctx: FeedContext) {
	const usualHours = FeedRotations.usualPlayHours(
		await FeedRepository.findMatchTimesByUserId({
			userId: ctx.viewerId,
			after: ctx.now - FEED_ROTATION_LOOKBACK_WEEKS * 7 * 24 * 60 * 60,
		}),
	);
	const preferences =
		await MatchProfileRepository.findMapModePreferencesByUserId(ctx.viewerId);

	const rotations = (await SplatoonRotationRepository.findAll()).flatMap(
		(rotation) => {
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
		},
	);
	if (rotations.length === 0) return null;

	return {
		at: ctx.now - 30 * 60,
		actorKey: "ROTATION",
		data: { rotations: R.sortBy(rotations, (rotation) => rotation.startsAt) },
	};
}

async function buildVoiceRoom(ctx: FeedContext) {
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
	const result = await FeedRepository.findFirstTournamentResultByUserId(
		ctx.viewerId,
	);
	if (!result) return null;

	const [tournament] = await FeedRepository.findTournamentsByIds([
		result.tournamentId,
	]);
	const [team] = await FeedRepository.findTournamentTeamsByIds([
		result.tournamentTeamId,
	]);

	return {
		at: ctx.now - 8 * HOUR,
		actorKey: "MEMORY",
		data: {
			tournament,
			team,
			placement: result.placement,
			participantCount: result.participantCount,
			yearsAgo: Math.max(
				1,
				Math.round((ctx.now - result.startsAt) / (365 * DAY)),
			),
		},
	};
}

async function buildCalendarEventNew(ctx: FeedContext) {
	const event = await FeedRepository.findLatestAddedUpcomingCalendarEvent(
		ctx.now,
	);
	if (!event) return null;

	const users = await usersById([event.authorId]);

	return {
		at: ctx.now - 2 * DAY,
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

async function usersById(userIds: number[]) {
	const users = await FeedRepository.findUsersByIds(R.unique(userIds));

	return new Map<number, CommonUser>(users.map((user) => [user.id, user]));
}

function tierOf(intervals: SkillTierInterval[], ordinal: number) {
	const interval = intervals.find((t) => t.neededOrdinal! <= ordinal);

	return interval
		? { name: interval.name, isPlus: interval.isPlus }
		: { name: "IRON" as const, isPlus: false };
}

const TIER_ORDER = [
	"IRON",
	"BRONZE",
	"SILVER",
	"GOLD",
	"PLATINUM",
	"DIAMOND",
	"LEVIATHAN",
];

/** Position on the ladder where each plus tier is its own step, e.g. Diamond+ is one above Diamond */
function tierRank(tier: { name: string; isPlus: boolean }) {
	return TIER_ORDER.indexOf(tier.name) * 2 + (tier.isPlus ? 1 : 0);
}
