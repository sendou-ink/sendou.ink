import cachified from "@epic-web/cachified";
import * as R from "remeda";
import {
	COMBINED_STREAMS_KEY,
	type SidebarStream,
} from "#lib/features/core-streams/streams.server.ts";
import {
	cachedFullUserLeaderboard,
	type UserLeaderboardWithAdditionsItem,
} from "#lib/features/leaderboards/leaderboards-core.server.ts";
import * as Seasons from "#lib/features/mmr/Seasons.ts";
import { TIERS, type TierName } from "#lib/features/mmr/mmr-constants.ts";
import { cache, IN_MILLISECONDS, ttl } from "#lib/server/cache.ts";
import { navIconUrl, SENDOUQ_STREAMS_PAGE, tierImageUrl } from "#lib/utils/urls.ts";
import * as QStreamsRepository from "./QStreamsRepository.server.ts";

const SENDOUQ_STREAMS_KEY = "sendouq-streams";

/**
 * Port note: unlike the React app the average tier of a streamed match is not
 * resolved (it needs the SendouQ in-process group tiers, which migrate with
 * sendouq). Until then streamed matches show the generic SendouQ icon.
 */

export function cachedStreams() {
	const season = Seasons.currentOrPrevious()!;

	return cachified({
		key: SENDOUQ_STREAMS_KEY,
		cache: cache,
		ttl: ttl(IN_MILLISECONDS.HALF_HOUR),
		async getFreshValue() {
			return streamedMatches({
				matchPlayers: await QStreamsRepository.findAllActiveMatchPlayers(),
				leaderboard: await cachedFullUserLeaderboard(season.nth),
			}).sort((a, b) => {
				const aTierIndex = TIERS.findIndex(
					(tier) => tier.name === a.tier?.name,
				);
				const bTierIndex = TIERS.findIndex(
					(tier) => tier.name === b.tier?.name,
				);

				// missing tiers sorted last
				if (aTierIndex === -1 && bTierIndex !== -1) {
					return 1;
				}
				if (aTierIndex !== -1 && bTierIndex === -1) {
					return -1;
				}

				// sort by base tier
				if (aTierIndex !== bTierIndex) {
					return aTierIndex - bTierIndex;
				}

				// if base tier is the same, sort by plus
				if (a.tier?.isPlus !== b.tier?.isPlus) {
					return a.tier?.isPlus ? -1 : 1;
				}

				// if tier is the same, sort by viewer count
				return b.stream.viewerCount - a.stream.viewerCount;
			});
		},
	});
}

function streamedMatches({
	matchPlayers,
	leaderboard,
}: {
	matchPlayers: QStreamsRepository.ActiveMatchPlayersItem[];
	leaderboard: UserLeaderboardWithAdditionsItem[];
}) {
	return matchPlayers.flatMap((player) => {
		if (!player.streamTwitch) {
			return [];
		}

		const leaderboardEntry = leaderboard.find(
			(entry) => entry.id === player.user?.id,
		);

		return {
			stream: {
				thumbnailUrl: player.streamThumbnailUrl,
				twitchUserName: player.streamTwitch,
				viewerCount: player.streamViewerCount,
			},
			match: {
				id: player.groupMatchId,
				createdAt: player.groupMatchCreatedAt,
			},
			user: {
				...player.user!,
				twitch: player.user!.twitch!,
			},
			weaponSplId: leaderboardEntry?.weaponSplId,
			tier: leaderboardEntry?.tier,
		};
	});
}

export type SendouQSidebarEntry = {
	sidebarStream: SidebarStream;
	tier: { name: TierName; isPlus: boolean } | null;
	twitchUsernames: string[];
};

/** Streamed SendouQ matches as sidebar stream entries. */
export async function getSendouQSidebarStreams(): Promise<
	SendouQSidebarEntry[]
> {
	const streams = await cachedStreams();

	const matchIdToStream = R.groupBy(streams, (s) => s.match.id);

	const entries: SendouQSidebarEntry[] = [];

	for (const [matchIdStr, matchStreams] of Object.entries(matchIdToStream)) {
		const matchId = Number(matchIdStr);
		const firstStream = matchStreams[0];

		const averageTier: { name: TierName; isPlus: boolean } | null = null;

		const twitchUsernames = matchStreams
			.map((s) => s.stream.twitchUserName)
			.filter((t): t is string => t !== null);

		entries.push({
			sidebarStream: {
				id: `sendouq-${matchId}`,
				name: `Match #${matchId}`,
				imageUrl: averageTier
					? `${tierImageUrl((averageTier as { name: TierName }).name)}.avif`
					: `${navIconUrl("sendouq")}.avif`,
				overlayIconUrl: averageTier
					? `${navIconUrl("sendouq")}.avif`
					: undefined,
				url: SENDOUQ_STREAMS_PAGE,
				subtitle: "",
				startsAt: firstStream.match.createdAt,
				tier: null,
			},
			tier: averageTier,
			twitchUsernames,
		});
	}

	return entries;
}

/** SendouQ streams' Twitch usernames, for deduping against other stream sources. */
export function refreshStreamsCache() {
	cache.delete(SENDOUQ_STREAMS_KEY);
	cache.delete(COMBINED_STREAMS_KEY);
}
