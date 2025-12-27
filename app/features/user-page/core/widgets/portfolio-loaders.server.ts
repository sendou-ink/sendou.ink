import * as ArtRepository from "~/features/art/ArtRepository.server";
import * as BadgeRepository from "~/features/badges/BadgeRepository.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import {
	allXPLeaderboard,
	weaponXPLeaderboard,
} from "~/features/leaderboards/queries/XPLeaderboard.server";
import * as LFGRepository from "~/features/lfg/LFGRepository.server";
import { ordinalToSp } from "~/features/mmr/mmr-utils";
import { userSkills as _userSkills } from "~/features/mmr/tiered.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import * as XRankPlacementRepository from "~/features/top-search/XRankPlacementRepository.server";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import * as VodRepository from "~/features/vods/VodRepository.server";
import { weaponCategories } from "~/modules/in-game-lists/weapon-ids";
import { sortBuilds } from "../build-sorting.server";
import type { ExtractWidgetSettings } from "./types";

export const WIDGET_LOADERS = {
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
	"peak-xp-weapon": async (
		userId: number,
		settings: ExtractWidgetSettings<"peak-xp-weapon">,
	) => {
		const placements = await XRankPlacementRepository.findPlacementsByUserId(
			userId,
			{
				weaponId: settings.weaponSplId,
				limit: 1,
			},
		);

		if (!placements || placements.length === 0) {
			return null;
		}

		const peakPlacement = placements[0];

		const leaderboard = weaponXPLeaderboard(settings.weaponSplId);
		const leaderboardPosition = leaderboard.findIndex(
			(entry) => entry.id === userId,
		);

		return {
			peakXp: peakPlacement.power,
			weaponSplId: settings.weaponSplId,
			leaderboardPosition:
				leaderboardPosition === -1 ? null : leaderboardPosition + 1,
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
	"placement-results": async (userId: number) => {
		const results = await UserRepository.findResultPlacementsByUserId(userId);

		if (results.length === 0) {
			return null;
		}

		const firstPlaceResults = results.filter(
			(result) => result.placement === 1,
		);
		const secondPlaceResults = results.filter(
			(result) => result.placement === 2,
		);
		const thirdPlaceResults = results.filter(
			(result) => result.placement === 3,
		);

		return {
			count: results.length,
			placements: [
				{
					placement: 1,
					count: firstPlaceResults.length,
				},
				{
					placement: 2,
					count: secondPlaceResults.length,
				},
				{
					placement: 3,
					count: thirdPlaceResults.length,
				},
			],
		};
	},
	"patron-since": async (userId: number) => {
		return UserRepository.patronSinceByUserId(userId);
	},
	videos: async (userId: number) => {
		return VodRepository.findByUserId(userId, 3);
	},
	"lfg-posts": async (userId: number) => {
		return LFGRepository.findByAuthorUserId(userId);
	},
	"top-500-weapons": async (userId: number) => {
		const placements =
			await XRankPlacementRepository.findPlacementsByUserId(userId);

		if (!placements || placements.length === 0) {
			return null;
		}

		const uniqueWeaponIds = [...new Set(placements.map((p) => p.weaponSplId))];

		return uniqueWeaponIds.sort((a, b) => a - b);
	},
	"top-500-weapons-shooters": async (userId: number) => {
		return getTop500WeaponsByCategory(userId, "SHOOTERS");
	},
	"top-500-weapons-blasters": async (userId: number) => {
		return getTop500WeaponsByCategory(userId, "BLASTERS");
	},
	"top-500-weapons-rollers": async (userId: number) => {
		return getTop500WeaponsByCategory(userId, "ROLLERS");
	},
	"top-500-weapons-brushes": async (userId: number) => {
		return getTop500WeaponsByCategory(userId, "BRUSHES");
	},
	"top-500-weapons-chargers": async (userId: number) => {
		return getTop500WeaponsByCategory(userId, "CHARGERS");
	},
	"top-500-weapons-sloshers": async (userId: number) => {
		return getTop500WeaponsByCategory(userId, "SLOSHERS");
	},
	"top-500-weapons-splatlings": async (userId: number) => {
		return getTop500WeaponsByCategory(userId, "SPLATLINGS");
	},
	"top-500-weapons-dualies": async (userId: number) => {
		return getTop500WeaponsByCategory(userId, "DUALIES");
	},
	"top-500-weapons-brellas": async (userId: number) => {
		return getTop500WeaponsByCategory(userId, "BRELLAS");
	},
	"top-500-weapons-stringers": async (userId: number) => {
		return getTop500WeaponsByCategory(userId, "STRINGERS");
	},
	"top-500-weapons-splatanas": async (userId: number) => {
		return getTop500WeaponsByCategory(userId, "SPLATANAS");
	},
	"x-rank-peaks": async (
		userId: number,
		settings: ExtractWidgetSettings<"x-rank-peaks">,
	) => {
		return XRankPlacementRepository.findPeaksByUserId(
			userId,
			settings.division,
		);
	},
	builds: async (userId: number) => {
		const userData = await UserRepository.identifierToBuildFields(
			String(userId),
		);

		if (!userData) return [];

		const builds = await BuildRepository.allByUserId(userId, {
			showPrivate: false,
		});

		const sortedBuilds = sortBuilds({
			builds,
			buildSorting: userData.buildSorting,
			weaponPool: userData.weapons,
		});

		return sortedBuilds.slice(0, 3);
	},
	art: async (userId: number, settings: ExtractWidgetSettings<"art">) => {
		const includeAuthored =
			settings.source === "ALL" || settings.source === "MADE-BY";
		const includeTagged =
			settings.source === "ALL" || settings.source === "MADE-OF";

		const arts = await ArtRepository.findArtsByUserId(userId, {
			includeAuthored,
			includeTagged,
		});

		return arts.slice(0, 3);
	},
};

async function getTop500WeaponsByCategory(
	userId: number,
	categoryName?: string,
) {
	const placements =
		await XRankPlacementRepository.findPlacementsByUserId(userId);

	if (!placements || placements.length === 0) {
		return null;
	}

	const allWeaponIds = placements.map((p) => p.weaponSplId);
	const uniqueWeaponIds = [...new Set(allWeaponIds)];

	const category = weaponCategories.find((c) => c.name === categoryName);
	if (!category) {
		return null;
	}

	const categoryWeaponIds = uniqueWeaponIds.filter((id) =>
		(category.weaponIds as readonly number[]).includes(id),
	);

	if (categoryWeaponIds.length === 0) {
		return null;
	}

	return {
		weaponIds: categoryWeaponIds.sort((a, b) => a - b),
		total: category.weaponIds.length,
	};
}
