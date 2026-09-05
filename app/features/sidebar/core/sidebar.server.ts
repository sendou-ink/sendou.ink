import { cachified } from "@epic-web/cachified";
import { addDays, addWeeks } from "date-fns";
import { href } from "react-router";
import * as R from "remeda";
import * as ExternalStreamRepository from "~/features/admin/ExternalStreamRepository.server";
import type { AuthenticatedUser } from "~/features/auth/core/user.server";
import * as AvailabilityRepository from "~/features/availability/AvailabilityRepository.server";
import * as Availability from "~/features/availability/core/Availability";
import { userIsBanned } from "~/features/ban/core/banned.server";
import type { ShowcaseCalendarEvent } from "~/features/calendar/calendar-types";
import {
	COMBINED_STREAMS_KEY,
	getLiveTournamentStreamerTwitchNames,
	getLiveTournamentStreams,
	type SidebarStream,
} from "~/features/core/streams/streams.server";
import * as FriendRepository from "~/features/friends/FriendRepository.server";
import {
	type FriendActivityType,
	isInProgressFriendActivity,
} from "~/features/friends/friends-constants";
import {
	type FriendActivity,
	resolveFriendActivity,
	resolveSendouQMatchStreams,
} from "~/features/friends/friends-utils.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import * as LiveStreamRepository from "~/features/live-streams/LiveStreamRepository.server";
import type { SidebarScrim } from "~/features/scrims/ScrimPostRepository.server";
import * as ScrimPostRepository from "~/features/scrims/ScrimPostRepository.server";
import { scrimsSearchParams } from "~/features/scrims/scrims-search-params";
import { getSendouQSidebarStreams } from "~/features/sendouq-streams/core/streams.server";
import { getViewerTimezone } from "~/features/timezone/timezone-context.server";
import type { TournamentTierNumber } from "~/features/tournament/core/tiering";
import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";
import { cache, ttl } from "~/utils/cache.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import type { CommonUser } from "~/utils/kysely.server";
import {
	BLANK_IMAGE_URL,
	discordAvatarUrl,
	navIconUrl,
	teamSchedulePage,
	twitchUrl,
	userPage,
} from "~/utils/urls";
import * as StreamRanking from "./StreamRanking";

export type SidebarEvent = {
	id: number;
	name: string;
	url: string;
	logoUrl: string | null;
	/** Whose avatar the event shows instead of a logo of its own. */
	user: CommonUser | null;
	startsAt: number;
	type: "tournament" | "scrim" | "teamEvent";
	scrimStatus?: "booked" | "looking" | "requestPending";
};

export type SidebarFriend = {
	id: number;
	name: string;
	discordId: string;
	discordAvatar: string | null;
	customAvatarUrl: string | null;
	url: string;
	subtitle: string;
	badge: string;
	activityType: FriendActivityType | null;
	matchId: number | null;
	tournamentId: number | null;
	streamUrl: string | null;
};

const MAX_EVENTS_VISIBLE = 5;
const MAX_FRIENDS_VISIBLE = 8;
const MAX_STREAMS_VISIBLE = 5;
const UPCOMING_TOURNAMENT_WINDOW_DAYS = 3;
const SENDOUQ_QUOTA = 2;
const TOURNAMENT_SUB_QUOTA = 2;

export async function resolveSidebarData(user: AuthenticatedUser | undefined) {
	const userId = user?.id ?? null;

	if (!userId) {
		return {
			events: [] as SidebarEvent[],
			friends: [] as SidebarFriend[],
			streams: await combinedStreamsCached(),
			savedTournamentIds: [] as number[],
			incomingFriendRequestIds: [] as number[],
			scheduleNudge: false,
		};
	}

	const tournamentsData =
		await ShowcaseTournaments.categorizedTournamentsByUserId(userId);
	const scrimsData = await ScrimPostRepository.findUserScrims(userId);
	const friendsWithActivity =
		await FriendRepository.findByUserIdWithActivity(userId);
	const savedTournaments =
		await SavedCalendarEventRepository.findAllUpcomingByUserId(userId);
	const incomingFriendRequestIds =
		await FriendRepository.findPendingReceivedRequestIds(userId);
	const streamedSendouQMatches = await resolveSendouQMatchStreams();
	const teamEvents = await findUpcomingTeamEvents(userId);
	const scheduleNudge = await showScheduleNudge(user);

	const seenTournamentIds = new Set<number>();
	const tournamentEvents: SidebarEvent[] = [
		...tournamentsData.participatingFor,
		...tournamentsData.organizingFor,
	]
		.filter((t) => {
			if (seenTournamentIds.has(t.id)) return false;
			seenTournamentIds.add(t.id);
			return true;
		})
		.map(tournamentToSidebarEvent);

	const savedEvents: SidebarEvent[] = savedTournaments
		.filter((t) => !seenTournamentIds.has(t.id))
		.map((t) => {
			seenTournamentIds.add(t.id);
			return tournamentToSidebarEvent(t);
		});

	const scrimEvents: SidebarEvent[] = scrimsData.map(scrimToSidebarEvent);

	const teamEventEvents: SidebarEvent[] = teamEvents.map(
		teamEventToSidebarEvent,
	);

	const events = [
		...tournamentEvents,
		...savedEvents,
		...scrimEvents,
		...teamEventEvents,
	]
		.sort((a, b) => a.startsAt - b.startsAt)
		.slice(0, MAX_EVENTS_VISIBLE);

	const friends = resolveFriends(friendsWithActivity, streamedSendouQMatches);

	const savedTournamentIds = savedTournaments.map((t) => t.id);

	return {
		events,
		friends,
		streams: await combinedStreamsCached(),
		savedTournamentIds,
		incomingFriendRequestIds,
		scheduleNudge,
	};
}

/** Prompt to report next week: on its last day, still empty, and not dismissed this week. */
async function showScheduleNudge(user: AuthenticatedUser | undefined) {
	if (!user) return false;

	const timezone = getViewerTimezone() ?? "UTC";
	const now = new Date();

	if (!Availability.isLastDayOfWeek(now, timezone)) return false;

	const weekStartsAt = Availability.weekStartsAt(addWeeks(now, 1), timezone);
	const dismissedAt = user.preferences?.scheduleNudgeDismissedWeekStartsAt;

	if (
		dismissedAt !== undefined &&
		Availability.isSameWeek(dismissedAt, weekStartsAt)
	) {
		return false;
	}

	return !(await AvailabilityRepository.hasReportedWeek({
		userId: user.id,
		weekStartsAt,
	}));
}

function combinedStreamsCached(): Promise<SidebarStream[]> {
	return cachified({
		key: COMBINED_STREAMS_KEY,
		cache,
		ttl: ttl(10 * 60 * 1000),
		async getFreshValue() {
			return combinedStreams();
		},
	});
}

async function combinedStreams(): Promise<SidebarStream[]> {
	const tournamentStreams = getLiveTournamentStreams();
	const [sendouQEntries, xRankRows, upcomingTournaments, externalStreams] =
		await Promise.all([
			getSendouQSidebarStreams(),
			LiveStreamRepository.findXRankStreams(),
			ShowcaseTournaments.upcomingTournaments(),
			ExternalStreamRepository.findAllForSidebar(),
		]);

	const seenUsernames = new Set([
		...getLiveTournamentStreamerTwitchNames(),
		...sendouQEntries.flatMap((e) =>
			e.twitchUsernames.map((t) => t.toLowerCase()),
		),
	]);

	const ranked: { stream: SidebarStream; score: number }[] = [];

	for (const externalStream of externalStreams) {
		ranked.push({
			stream: {
				id: `external-${externalStream.id}`,
				name: externalStream.name,
				imageUrl: externalStream.avatarUrl ?? BLANK_IMAGE_URL,
				url: externalStream.url,
				subtitle: "",
				startsAt: externalStream.startsAt,
				tier: null,
			},
			score: StreamRanking.EXTERNAL_STREAM_SCORE,
		});
	}

	for (const stream of tournamentStreams) {
		ranked.push({
			stream,
			score: StreamRanking.tournamentTierToScore(
				stream.tier,
				stream.membersPerTeam,
			),
		});
	}

	for (const { sidebarStream, tier } of sendouQEntries) {
		const score = tier ? StreamRanking.sendouQTierToScore(tier) : 9;
		ranked.push({ stream: sidebarStream, score });
	}

	const xRankByStream = new Map<string, (typeof xRankRows)[number]>();
	for (const row of xRankRows) {
		const key = row.twitchUsername?.toLowerCase() ?? `user-${row.id}`;
		const existing = xRankByStream.get(key);
		if (!existing || (row.peakXp ?? 0) > (existing.peakXp ?? 0)) {
			xRankByStream.set(key, row);
		}
	}

	for (const row of xRankByStream.values()) {
		if (userIsBanned(row.id)) continue;

		if (
			row.twitchUsername &&
			seenUsernames.has(row.twitchUsername.toLowerCase())
		) {
			continue;
		}

		const score = StreamRanking.xpToScore(row.peakXp ?? 0);
		if (score === null) continue;

		ranked.push({
			stream: {
				id: `xrank-${row.id}`,
				name: row.username,
				imageUrl: row.customAvatarUrl
					? row.customAvatarUrl
					: row.discordAvatar
						? discordAvatarUrl({
								discordId: row.discordId,
								discordAvatar: row.discordAvatar,
								size: "sm",
							})
						: BLANK_IMAGE_URL,
				url: row.twitchUsername
					? twitchUrl(row.twitchUsername)
					: userPage({ discordId: row.discordId, customUrl: row.customUrl }),
				subtitle: "",
				startsAt: Math.floor(Date.now() / 1000),
				tier: null,
				peakXp: row.peakXp ?? undefined,
			},
			score,
		});
	}

	const nowTimestamp = dateToDatabaseTimestamp(new Date());
	const threeDaysFromNow = dateToDatabaseTimestamp(
		addDays(new Date(), UPCOMING_TOURNAMENT_WINDOW_DAYS),
	);
	for (const event of upcomingTournaments) {
		const effectiveTier = event.tier ?? event.tentativeTier;
		if (effectiveTier === null) continue;
		if (event.startsAt < nowTimestamp) continue;
		if (event.startsAt > threeDaysFromNow) continue;
		if (event.hidden) continue;

		const membersPerTeam = event.minMembersPerTeam ?? 4;

		ranked.push({
			stream: {
				id: `upcoming-${event.id}`,
				name: event.name,
				imageUrl: event.logoUrl ?? BLANK_IMAGE_URL,
				url: event.url,
				subtitle: "",
				startsAt: event.startsAt,
				tier: (event.tier as TournamentTierNumber) ?? null,
				membersPerTeam,
				tentativeTier: event.tentativeTier ?? undefined,
			},
			score: StreamRanking.upcomingTournamentTierToScore(
				effectiveTier,
				membersPerTeam,
			),
		});
	}

	return StreamRanking.rank(ranked, MAX_STREAMS_VISIBLE);
}

type FriendWithActivity = Awaited<
	ReturnType<typeof FriendRepository.findByUserIdWithActivity>
>[number];

function resolveFriends(
	friendsWithActivity: FriendWithActivity[],
	streamedSendouQMatches: ReadonlyMap<number, string>,
) {
	const activityForRow = (row: FriendWithActivity) =>
		resolveFriendActivity({
			friendId: row.id,
			tournamentId: row.tournamentId,
			tournamentName: row.tournamentName,
			teamMemberCount: row.teamMemberCount,
			tournamentMinTeamSize: row.tournamentMinTeamSize,
			sendouQMatchStreams: streamedSendouQMatches,
		});

	const unique = R.uniqueBy(friendsWithActivity, (f) => f.id);
	const friendRows = unique.filter((f) => f.friendshipId !== null);
	const teamMemberRows = unique.filter((f) => f.friendshipId === null);

	const activeFriends: SidebarFriend[] = [];
	const sendouqFriends: SidebarFriend[] = [];
	const tournamentSubFriends: SidebarFriend[] = [];
	const inactiveFriends: FriendWithActivity[] = [];

	for (const friend of friendRows) {
		const activity = activityForRow(friend);

		if (!activity.type) {
			inactiveFriends.push(friend);
			continue;
		}

		const sidebarFriend = rowToSidebarFriend(friend, activity);

		if (isInProgressFriendActivity(activity.type)) {
			activeFriends.push(sidebarFriend);
		} else if (activity.type === "SENDOUQ") {
			sendouqFriends.push(sidebarFriend);
		} else {
			tournamentSubFriends.push(sidebarFriend);
		}
	}

	const result: SidebarFriend[] = [];

	const sendouqToShow = sendouqFriends.slice(0, SENDOUQ_QUOTA);
	const tournamentToShow = tournamentSubFriends.slice(0, TOURNAMENT_SUB_QUOTA);

	result.push(...sendouqToShow, ...tournamentToShow);

	const remaining = MAX_FRIENDS_VISIBLE - result.length;
	if (remaining > 0) {
		const extraSendouq = sendouqFriends.slice(SENDOUQ_QUOTA);
		const extraTournament = tournamentSubFriends.slice(TOURNAMENT_SUB_QUOTA);
		result.push(...[...extraSendouq, ...extraTournament].slice(0, remaining));
	}

	if (result.length < MAX_FRIENDS_VISIBLE) {
		result.push(...activeFriends.slice(0, MAX_FRIENDS_VISIBLE - result.length));
	}

	if (result.length < MAX_FRIENDS_VISIBLE) {
		const shownIds = new Set(result.map((f) => f.id));
		const inactiveTeamMembers: FriendWithActivity[] = [];

		for (const tm of teamMemberRows) {
			if (result.length >= MAX_FRIENDS_VISIBLE) break;
			if (shownIds.has(tm.id)) continue;

			const activity = activityForRow(tm);
			if (!activity.type) {
				inactiveTeamMembers.push(tm);
				continue;
			}

			result.push(rowToSidebarFriend(tm, activity));
			shownIds.add(tm.id);
		}

		for (const friend of inactiveFriends) {
			if (result.length >= MAX_FRIENDS_VISIBLE) break;
			if (shownIds.has(friend.id)) continue;

			result.push(rowToSidebarFriend(friend, null));
			shownIds.add(friend.id);
		}

		for (const tm of inactiveTeamMembers) {
			if (result.length >= MAX_FRIENDS_VISIBLE) break;

			result.push(rowToSidebarFriend(tm, null));
		}
	}

	return result.slice(0, MAX_FRIENDS_VISIBLE);
}

function rowToSidebarFriend(
	row: FriendWithActivity,
	activity: FriendActivity | null,
): SidebarFriend {
	return {
		id: row.id,
		name: row.username,
		discordId: row.discordId,
		discordAvatar: row.discordAvatar,
		customAvatarUrl: row.customAvatarUrl,
		url: userPage({ discordId: row.discordId, customUrl: row.customUrl }),
		subtitle: activity?.subtitle ?? "",
		badge: activity?.badge ?? "",
		activityType: activity?.type ?? null,
		matchId: activity?.matchId ?? null,
		tournamentId: activity?.tournamentId ?? row.tournamentId,
		streamUrl: activity?.streamUrl ?? null,
	};
}

export function tournamentToSidebarEvent(
	t: ShowcaseCalendarEvent,
): SidebarEvent {
	return {
		id: t.id,
		name: t.name,
		url: t.url,
		logoUrl: t.logoUrl,
		user: null,
		startsAt: t.startsAt,
		type: "tournament" as const,
	};
}

const TEAM_EVENT_WINDOW_DAYS = 14;

/** Ongoing team events and those starting within two weeks. */
export function findUpcomingTeamEvents(userId: number) {
	const now = new Date();

	return AvailabilityRepository.findAllUpcomingTeamEventsByUserId({
		userId,
		startsAt: dateToDatabaseTimestamp(now),
		endsAt: dateToDatabaseTimestamp(addDays(now, TEAM_EVENT_WINDOW_DAYS)),
	});
}

type UpcomingTeamEvent = Awaited<
	ReturnType<typeof AvailabilityRepository.findAllUpcomingTeamEventsByUserId>
>[number];

const TEAM_ICON_URL = `${navIconUrl("t")}.avif`;

export function teamEventToSidebarEvent(
	event: UpcomingTeamEvent,
): SidebarEvent {
	return {
		id: event.id,
		name: event.name,
		url: teamSchedulePage(event.teamCustomUrl),
		logoUrl: event.teamAvatarUrl ?? TEAM_ICON_URL,
		user: null,
		startsAt: event.startsAt,
		type: "teamEvent" as const,
	};
}

const SCRIMS_ICON_URL = `${navIconUrl("scrims")}.avif`;

export function scrimToSidebarEvent(s: SidebarScrim): SidebarEvent {
	return {
		id: s.id,
		name: s.opponentName ?? "Scrim",
		url:
			s.status === "booked"
				? href("/scrims/:id", { id: String(s.id) })
				: s.status === "requestPending"
					? scrimsSearchParams.href(href("/scrims"), {
							pendingRequestPostId: s.id,
						})
					: href("/scrims"),
		// an opponent without a team is shown by their owner's avatar instead
		logoUrl: s.opponentAvatarUrl ?? (s.opponentUser ? null : SCRIMS_ICON_URL),
		user: s.opponentUser,
		startsAt: s.startsAt,
		type: "scrim" as const,
		scrimStatus: s.status,
	};
}
