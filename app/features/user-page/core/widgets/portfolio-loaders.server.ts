import * as BadgeRepository from "~/features/badges/BadgeRepository.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import { allXPLeaderboard } from "~/features/leaderboards/queries/XPLeaderboard.server";
import { ordinalToSp } from "~/features/mmr/mmr-utils";
import { userSkills as _userSkills } from "~/features/mmr/tiered.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import * as XRankPlacementRepository from "~/features/top-search/XRankPlacementRepository.server";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import * as VodRepository from "~/features/vods/VodRepository.server";

export const WIDGET_LOADERS = {
	bio: async (userId: number) => {
		return (await UserRepository.findProfileByIdentifier(String(userId)))?.bio;
	},
	"badges-owned": async (userId: number) => {
		return BadgeRepository.findByOwnerUserId(userId);
	},
	"badges-authored": async (userId: number) => {
		return BadgeRepository.findByAuthorUserId(userId);
	},
	teams: async (userId: number) => {
		return TeamRepository.findAllMemberOfByUserId(userId);
	},
	organizations: async (userId: number) => {
		return TournamentOrganizationRepository.findByUserId(userId);
	},
	"peak-sp": async (userId: number) => {
		const seasonsParticipatedIn =
			await LeaderboardRepository.seasonsParticipatedInByUserId(userId);

		if (seasonsParticipatedIn.length === 0) {
			return null;
		}

		let peakData = null;
		let maxOrdinal = Number.NEGATIVE_INFINITY;

		for (const season of seasonsParticipatedIn) {
			const { userSkills } = _userSkills(season);
			const skillData = userSkills[userId];

			if (!skillData || skillData.approximate) {
				continue;
			}

			if (skillData.ordinal > maxOrdinal) {
				maxOrdinal = skillData.ordinal;
				peakData = {
					peakSp: ordinalToSp(skillData.ordinal),
					tierName: skillData.tier.name,
					isPlus: skillData.tier.isPlus,
					season,
				};
			}
		}

		return peakData;
	},
	"peak-xp": async (userId: number) => {
		const placements = await XRankPlacementRepository.findPlacementsByUserId(
			userId,
			{
				limit: 1,
			},
		);

		if (!placements || placements.length === 0) {
			return null;
		}

		const peakPlacement = placements[0];
		const leaderboardEntry =
			// optimize, only check leaderboard if peak placement is high enough
			peakPlacement.power >= 3318.9
				? allXPLeaderboard().find((entry) => entry.id === userId)
				: null;

		return {
			peakXp: peakPlacement.power,
			division: peakPlacement.region === "WEST" ? "Tentatek" : "Takoroka",
			topRating: leaderboardEntry?.placementRank ?? null,
		};
	},
	"highlighted-results": async (userId: number) => {
		const hasHighlightedResults =
			await UserRepository.hasHighlightedResultsByUserId(userId);

		const results = await UserRepository.findResultsByUserId(userId, {
			showHighlightsOnly: hasHighlightedResults,
			limit: 3,
		});

		return results;
	},
	"patron-since": async (userId: number) => {
		return UserRepository.patronSinceByUserId(userId);
	},
	videos: async (userId: number) => {
		return VodRepository.findByUserId(userId, 3);
	},
} as const;
