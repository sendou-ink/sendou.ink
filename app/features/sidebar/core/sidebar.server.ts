import { cachified } from "@epic-web/cachified";
import { addDays } from "date-fns";
import { href } from "react-router";
import * as R from "remeda";
import { userIsBanned } from "~/features/ban/core/banned.server";
import type { ShowcaseCalendarEvent } from "~/features/calendar/calendar-types";
import {
	COMBINED_STREAMS_KEY,
	getLiveTournamentStreams,
	type SidebarStream,
} from "~/features/core/streams/streams.server";
import * as FriendRepository from "~/features/friends/FriendRepository.server";
import { SENDOUQ_ACTIVITY_LABEL } from "~/features/friends/friends-constants";
import { resolveFriendActivity } from "~/features/friends/friends-utils.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import * as LiveStreamRepository from "~/features/live-streams/LiveStreamRepository.server";
import type { SidebarScrim } from "~/features/scrims/ScrimPostRepository.server";
import * as ScrimPostRepository from "~/features/scrims/ScrimPostRepository.server";
import { getSendouQSidebarStreams } from "~/features/sendouq-streams/core/streams.server";
import type { TournamentTierNumber } from "~/features/tournament/core/tiering";
import * as SavedCalendarEventRepository from "~/features/tournament/SavedCalendarEventRepository.server";
import { cache, ttl } from "~/utils/cache.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import {
	BLANK_IMAGE_URL,
	discordAvatarUrl,
	navIconUrl,
	twitchUrl,
	userPage,
} from "~/utils/urls";
import * as StreamRanking from "./StreamRanking";

export type SidebarEvent = {
	id: number;
	name: string;
	url: string;
	logoUrl: string | null;
	startTime: number;
	type: "tournament" | "scrim";
	scrimStatus?: "booked" | "looking" | "requestPending";
};

export type SidebarFriend = {
	id: number;
	name: string;
	discordId: string;
	discordAvatar: string | null;
	url: string;
	subtitle: string;
	badge: string;
	tournamentId: number | null;
};

const MAX_EVENTS_VISIBLE = 5;
const MAX_FRIENDS_VISIBLE = 8;
const MAX_STREAMS_VISIBLE = 5;
const UPCOMING_TOURNAMENT_WINDOW_DAYS = 3;
const SENDOUQ_QUOTA = 2;
const TOURNAMENT_SUB_QUOTA = 2;

export async function resolveSidebarData(userId: number | null) {
	if (!userId) {
		const tournamentsData =
			await ShowcaseTournaments.categorizedTournamentsByUserId(null);
		return {
			events: showcaseEventsToSidebarEvents(tournamentsData.showcase),
			friends: [] as SidebarFriend[],
			streams: await combinedStreamsCached(),
			savedTournamentIds: [] as number[],
		};
	}

	const [tournamentsData, scrimsData, friendsWithActivity, savedTournaments] =
		await Promise.all([
			ShowcaseTournaments.categorizedTournamentsByUserId(userId),
			ScrimPostRepository.findUserScrims(userId),
			FriendRepository.findByUserIdWithActivity(userId),
			SavedCalendarEventRepository.upcoming(userId),
		]);

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

	const personalEvents = [
		...tournamentEvents,
		...savedEvents,
		...scrimEvents,
	].sort((a, b) => a.startTime - b.startTime);
	const events = (
		personalEvents.length > 0
			? personalEvents
			: showcaseEventsToSidebarEvents(tournamentsData.showcase)
	).slice(0, MAX_EVENTS_VISIBLE);

	const friends = resolveFriends(friendsWithActivity);

	const savedTournamentIds = savedTournaments.map((t) => t.id);

	return {
		events,
		friends,
		streams: await combinedStreamsCached(),
		savedTournamentIds,
	};
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
	const [sendouQEntries, xRankRows, upcomingTournaments] = await Promise.all([
		getSendouQSidebarStreams(),
		LiveStreamRepository.findXRankStreams(),
		ShowcaseTournaments.upcomingTournaments(),
	]);

	const seenUsernames = new Set(
		sendouQEntries.flatMap((e) =>
			e.twitchUsernames.map((t) => t.toLowerCase()),
		),
	);

	const ranked: { stream: SidebarStream; score: number }[] = [];

	for (const stream of tournamentStreams) {
		ranked.push({
			stream,
			score: StreamRanking.tournamentTierToScore(stream.tier),
		});
	}

	for (const { sidebarStream, tier } of sendouQEntries) {
		const score = tier ? StreamRanking.sendouQTierToScore(tier) : 9;
		ranked.push({ stream: sidebarStream, score });
	}

	const xRankByUser = new Map<number, (typeof xRankRows)[number]>();
	for (const row of xRankRows) {
		const existing = xRankByUser.get(row.id);
		if (!existing || (row.peakXp ?? 0) > (existing.peakXp ?? 0)) {
			xRankByUser.set(row.id, row);
		}
	}

	for (const row of xRankByUser.values()) {
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
				imageUrl: row.discordAvatar
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
		if (event.startTime < nowTimestamp) continue;
		if (event.startTime > threeDaysFromNow) continue;
		if (event.hidden) continue;
		if ((event.minMembersPerTeam ?? 4) < 4) continue;

		ranked.push({
			stream: {
				id: `upcoming-${event.id}`,
				name: event.name,
				imageUrl: event.logoUrl ?? BLANK_IMAGE_URL,
				url: event.url,
				subtitle: "",
				startsAt: event.startTime,
				tier: (event.tier as TournamentTierNumber) ?? null,
				tentativeTier: event.tentativeTier ?? undefined,
			},
			score: StreamRanking.upcomingTournamentTierToScore(effectiveTier),
		});
	}

	return StreamRanking.rank(ranked, MAX_STREAMS_VISIBLE);
}

type FriendWithActivity = Awaited<
	ReturnType<typeof FriendRepository.findByUserIdWithActivity>
>[number];

function resolveFriends(friendsWithActivity: FriendWithActivity[]) {
	const unique = R.uniqueBy(friendsWithActivity, (f) => f.id);
	const friendRows = unique.filter((f) => f.friendshipId !== null);
	const teamMemberRows = unique.filter((f) => f.friendshipId === null);

	const sendouqFriends: SidebarFriend[] = [];
	const tournamentSubFriends: SidebarFriend[] = [];
	const inactiveFriends: FriendWithActivity[] = [];

	for (const friend of friendRows) {
		const activity = resolveFriendActivity(
			friend.id,
			friend.tournamentName,
			friend.teamMemberCount,
			friend.tournamentMinTeamSize,
		);

		if (!activity.subtitle) {
			inactiveFriends.push(friend);
			continue;
		}

		const sidebarFriend = rowToSidebarFriend(
			friend,
			activity.subtitle,
			activity.badge ?? "",
		);

		if (activity.subtitle === SENDOUQ_ACTIVITY_LABEL) {
			sendouqFriends.push(sidebarFriend);
		} else {
			// this is temporary, will be replaced with "SQified tournament team creator"
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
		const shownIds = new Set(result.map((f) => f.id));
		const inactiveTeamMembers: FriendWithActivity[] = [];

		for (const tm of teamMemberRows) {
			if (result.length >= MAX_FRIENDS_VISIBLE) break;
			if (shownIds.has(tm.id)) continue;

			const activity = resolveFriendActivity(
				tm.id,
				tm.tournamentName,
				tm.teamMemberCount,
				tm.tournamentMinTeamSize,
			);
			if (!activity.subtitle) {
				inactiveTeamMembers.push(tm);
				continue;
			}

			result.push(
				rowToSidebarFriend(tm, activity.subtitle, activity.badge ?? ""),
			);
			shownIds.add(tm.id);
		}

		for (const friend of inactiveFriends) {
			if (result.length >= MAX_FRIENDS_VISIBLE) break;
			if (shownIds.has(friend.id)) continue;

			result.push(rowToSidebarFriend(friend, "", ""));
			shownIds.add(friend.id);
		}

		for (const tm of inactiveTeamMembers) {
			if (result.length >= MAX_FRIENDS_VISIBLE) break;

			result.push(rowToSidebarFriend(tm, "", ""));
		}
	}

	return result;
}

function showcaseEventsToSidebarEvents(
	events: ShowcaseCalendarEvent[],
): SidebarEvent[] {
	return events.map((e) => ({
		id: e.id,
		name: e.name,
		url: e.url,
		logoUrl: e.logoUrl,
		startTime: e.startTime,
		type: "tournament" as const,
	}));
}

function rowToSidebarFriend(
	row: FriendWithActivity,
	subtitle: string,
	badge: string,
): SidebarFriend {
	return {
		id: row.id,
		name: row.username,
		discordId: row.discordId,
		discordAvatar: row.discordAvatar,
		url: userPage({ discordId: row.discordId, customUrl: row.customUrl }),
		subtitle,
		badge,
		tournamentId: row.tournamentId,
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
		startTime: t.startTime,
		type: "tournament" as const,
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
				: href("/scrims"),
		logoUrl: s.opponentAvatarUrl ?? SCRIMS_ICON_URL,
		startTime: s.at,
		type: "scrim" as const,
		scrimStatus: s.status,
	};
}
