import cachified from "@epic-web/cachified";
import { HALF_HOUR_IN_MS } from "~/constants";
import {
	type UserLeaderboardWithAdditionsItem,
	cachedFullUserLeaderboard,
} from "~/features/leaderboards/core/leaderboards.server";
import { TIERS } from "~/features/mmr/mmr-constants";
import { currentOrPreviousSeason } from "~/features/mmr/season";
import * as QStreamsRepository from "~/features/sendouq-streams/QStreamsRepository.server";
import { getStreams } from "~/modules/twitch";
import type { MappedStream } from "~/modules/twitch/streams";
import { cache, ttl } from "~/utils/cache.server";
import { SENDOUQ_STREAMS_KEY } from "../q-streams-constants";

export function cachedStreams() {
	const season = currentOrPreviousSeason(new Date())!;

	return cachified({
		key: SENDOUQ_STREAMS_KEY,
		cache: cache,
		ttl: ttl(HALF_HOUR_IN_MS),
		async getFreshValue() {
			return streamedMatches({
				matchPlayers: await QStreamsRepository.activeMatchPlayers(),
				streams: await getStreams(),
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

export function refreshStreamsCache() {
	cache.delete(SENDOUQ_STREAMS_KEY);
	void cachedStreams().catch((err) =>
		console.error(`Failed to refresh cache: ${err}`),
	);
}

function streamedMatches({
	matchPlayers,
	streams,
	leaderboard,
}: {
	matchPlayers: QStreamsRepository.ActiveMatchPlayersItem[];
	streams: MappedStream[];
	leaderboard: UserLeaderboardWithAdditionsItem[];
}) {
	return matchPlayers.flatMap((player) => {
		const stream = streams.find(
			(stream) => stream.twitchUserName === player.user?.twitch?.toLowerCase(),
		);

		if (!stream) {
			return [];
		}

		const leaderboardEntry = leaderboard.find(
			(entry) => entry.id === player.user?.id,
		);

		return {
			stream,
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
