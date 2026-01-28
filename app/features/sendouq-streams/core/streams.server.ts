import cachified from "@epic-web/cachified";
import * as R from "remeda";
import type { SidebarStream } from "~/features/core/streams/streams.server";
import {
	cachedFullUserLeaderboard,
	type UserLeaderboardWithAdditionsItem,
} from "~/features/leaderboards/core/leaderboards.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { TIERS, type TierName } from "~/features/mmr/mmr-constants";
import { SendouQ } from "~/features/sendouq/core/SendouQ.server";
import * as QStreamsRepository from "~/features/sendouq-streams/QStreamsRepository.server";
import { cache, IN_MILLISECONDS, ttl } from "~/utils/cache.server";
import { logger } from "~/utils/logger";
import { navIconUrl, SENDOUQ_STREAMS_PAGE, tierImageUrl } from "~/utils/urls";
import { SENDOUQ_STREAMS_KEY } from "../q-streams-constants";

export function cachedStreams() {
	const season = Seasons.currentOrPrevious()!;

	return cachified({
		key: SENDOUQ_STREAMS_KEY,
		cache: cache,
		ttl: ttl(IN_MILLISECONDS.HALF_HOUR),
		async getFreshValue() {
			return streamedMatches({
				matchPlayers: await QStreamsRepository.activeMatchPlayers(),
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
		logger.error(`Failed to refresh cache: ${err}`),
	);
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

export async function getSendouQSidebarStreams(): Promise<SidebarStream[]> {
	const streams = await cachedStreams();

	const matchIdToStream = R.groupBy(streams, (s) => s.match.id);

	const sidebarStreams: SidebarStream[] = [];

	for (const [matchIdStr, matchStreams] of Object.entries(matchIdToStream)) {
		const matchId = Number(matchIdStr);
		const firstStream = matchStreams[0];

		const matchGroups = SendouQ.groups.filter((g) => g.matchId === matchId);
		const averageTier = calculateAverageTierForMatch(matchGroups);

		sidebarStreams.push({
			id: -matchId,
			name: `Match #${matchId}`,
			imageUrl: averageTier
				? `${tierImageUrl(averageTier.name)}.png`
				: `${navIconUrl("sendouq")}.png`,
			overlayIconUrl: averageTier ? `${navIconUrl("sendouq")}.png` : undefined,
			url: SENDOUQ_STREAMS_PAGE,
			subtitle: averageTier
				? `${averageTier.name}${averageTier.isPlus ? "+" : ""}`
				: "",
			startsAt: firstStream.match.createdAt,
			tier: null,
		});
	}

	return sidebarStreams.sort((a, b) => {
		const aTierIndex = getTierIndexFromSubtitle(a.subtitle);
		const bTierIndex = getTierIndexFromSubtitle(b.subtitle);
		return aTierIndex - bTierIndex;
	});
}

function calculateAverageTierForMatch(
	matchGroups: (typeof SendouQ.groups)[number][],
): { name: TierName; isPlus: boolean } | null {
	if (matchGroups.length !== 2) return null;

	const allTiers = matchGroups
		.map((g) => g.tier)
		.filter((t): t is NonNullable<typeof t> => t !== null);

	if (allTiers.length !== 2) return null;

	const tierIndexSum = allTiers.reduce((sum, tier) => {
		const baseIndex = TIERS.findIndex((t) => t.name === tier.name);
		const indexWithPlus = baseIndex * 2 + (tier.isPlus ? 0 : 1);
		return sum + indexWithPlus;
	}, 0);

	const averageIndex = tierIndexSum / 2;
	const baseTierIndex = Math.floor(averageIndex / 2);
	const isPlus = averageIndex % 2 < 1;

	const tierName = TIERS[baseTierIndex]?.name ?? "IRON";

	return { name: tierName, isPlus };
}

function getTierIndexFromSubtitle(subtitle: string): number {
	const tierName = subtitle.replace("+", "");
	const isPlus = subtitle.endsWith("+");
	const baseIndex = TIERS.findIndex((t) => t.name === tierName);
	if (baseIndex === -1) return 999;
	return baseIndex * 2 + (isPlus ? 0 : 1);
}
