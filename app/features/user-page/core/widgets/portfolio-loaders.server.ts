import * as R from "remeda";
import type { Tables } from "~/db/tables";
import * as ArtRepository from "~/features/art/ArtRepository.server";
import * as BadgeRepository from "~/features/badges/BadgeRepository.server";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import * as FriendRepository from "~/features/friends/FriendRepository.server";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as LFGRepository from "~/features/lfg/LFGRepository.server";
import * as LiveStreamRepository from "~/features/live-streams/LiveStreamRepository.server";
import { BANNED_MAPS } from "~/features/match-profile/banned-maps";
import * as MatchProfileRepository from "~/features/match-profile/MatchProfileRepository.server";
import type { TierName } from "~/features/mmr/mmr-constants";
import { ordinalToSp } from "~/features/mmr/mmr-utils";
import { userSkills as _userSkills } from "~/features/mmr/tiered.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import * as XRankPlacementRepository from "~/features/top-search/XRankPlacementRepository.server";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import * as TrophyRepository from "~/features/trophies/TrophyRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import * as VodRepository from "~/features/vods/VodRepository.server";
import { modesShort } from "~/modules/in-game-lists/modes";
import {
	mainWeaponIds,
	weaponCategories,
} from "~/modules/in-game-lists/weapon-ids";
import { bskyUrl, twitchUrl, youtubeUrl } from "~/utils/urls";
import { SPL2_JOIN_ORDER_CUTOFF } from "../../user-page-constants";
import { sortTrophiesByFavorites } from "../trophy-sorting.server";
import type { ExtractWidgetSettings } from "./types";
import { cachedUserSQLeaderboardTopData } from "./utils.server";

export const WIDGET_LOADERS = {
	"trophies-owned": async (userId: number) => {
		const owner = await trophyPreferencesOf(userId).executeTakeFirst();
		if (!owner) return [];

		const hiddenTrophyIds = new Set(owner.hiddenTrophyIds ?? []);
		const trophies = await TrophyRepository.findAllByOwnerUserId(userId);

		return sortTrophiesByFavorites({
			...owner,
			trophies: trophies.filter((trophy) => !hiddenTrophyIds.has(trophy.id)),
		}).trophies;
	},
	"badges-owned": async (
		userId: number,
		settings: ExtractWidgetSettings<"badges-owned">,
	) => {
		return BadgeRepository.findAllByOwnerUserId({
			userId,
			favoriteBadgeIds: settings.favoriteBadgeIds,
		});
	},
	"badges-authored": async (userId: number) => {
		return BadgeRepository.badges().where({ authorId: userId }).execute();
	},
	"badges-managed": async (userId: number) => {
		return BadgeRepository.badges().managedBy([userId]).execute();
	},
	teams: async (userId: number) => {
		return TeamRepository.teams().forMember(userId).withLogo().execute();
	},
	organizations: async (userId: number) => {
		return TournamentOrganizationRepository.findByUserId(userId);
	},
	"peak-sp": async (userId: number) => {
		const seasonsParticipatedIn =
			await LeaderboardRepository.findSeasonsParticipatedInByUserId(userId);

		if (seasonsParticipatedIn.length === 0) {
			return null;
		}

		let peakData: {
			peakSp: number;
			tierName: TierName;
			isPlus: boolean;
			season: number;
		} | null = null;
		let maxOrdinal = Number.NEGATIVE_INFINITY;

		for (const season of seasonsParticipatedIn) {
			const { userSkills } = await _userSkills(season);
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
	"top-10-seasons": async (userId: number) => {
		const cache = await cachedUserSQLeaderboardTopData();
		const userData = cache.get(userId);

		if (!userData || userData.TOP_10.times === 0) {
			return null;
		}

		return userData.TOP_10;
	},
	"top-100-seasons": async (userId: number) => {
		const cache = await cachedUserSQLeaderboardTopData();
		const userData = cache.get(userId);

		if (!userData || userData.TOP_100.times === 0) {
			return null;
		}

		return userData.TOP_100;
	},
	"peak-xp": async (userId: number) => {
		const peakPlacement = await peakPlacementOf(userId).executeTakeFirst();

		if (!peakPlacement) {
			return null;
		}

		const leaderboardEntry =
			// optimize, only check leaderboard if peak placement is high enough
			peakPlacement.power >= 3318.9
				? (await LeaderboardRepository.findAllXPLeaderboard()).find(
						(entry) => entry.id === userId,
					)
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
		const peakPlacement = await peakPlacementOf(userId)
			.where({ weaponSplId: settings.weaponSplId })
			.executeTakeFirst();

		if (!peakPlacement) {
			return null;
		}

		const leaderboard = await LeaderboardRepository.findWeaponXPLeaderboard(
			settings.weaponSplId,
		);
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
		return (await UserRepository.findById(userId))?.patronStartedAt;
	},
	"join-date": async (userId: number) => {
		const joinOrder = (await UserRepository.findById(userId))?.joinOrder;
		if (!joinOrder) return null;

		return { joinOrder, isSpl2: joinOrder <= SPL2_JOIN_ORDER_CUTOFF };
	},
	videos: async (userId: number) => {
		return VodRepository.userVods(userId).limit(3).execute();
	},
	"lfg-posts": async (userId: number) => {
		const posts = await authorsPosts(userId).execute();

		return posts.map((post) => ({ id: post.id, type: post.type }));
	},
	"top-500-weapons": async (userId: number) => {
		const placements = await XRankPlacementRepository.placements()
			.claimedBy(userId)
			.execute();

		if (placements.length === 0) {
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
		const placements = await XRankPlacementRepository.placements()
			.claimedBy(userId)
			.inDivision(settings.division)
			.highestPowerFirst()
			.execute();

		return modesShort.flatMap((mode) => {
			const peak = placements.find((placement) => placement.mode === mode);
			return peak ? [peak] : [];
		});
	},
	builds: async (userId: number) => {
		return (
			BuildRepository.builds()
				// xxx: should we limit the where type to only columns with index..?
				.where({ ownerId: userId })
				.newestFirst()
				.limit(3)
				.execute()
		);
	},
	art: async (userId: number, settings: ExtractWidgetSettings<"art">) => {
		return ArtRepository.arts()
			.involvingUser(userId, settings.source)
			.limit(3)
			.execute();
	},
	commissions: async (userId: number) => {
		const user = await UserRepository.findById(userId);
		if (!user) return;

		return R.pick(user, [
			"commissionsOpen",
			"commissionsOpenedAt",
			"commissionText",
		]);
	},
	"weapon-pool": async (
		userId: number,
		settings: ExtractWidgetSettings<"weapon-pool">,
	) => {
		if (settings.weaponPool.length === 0) {
			return MatchProfileRepository.findWeaponPoolByUserId(userId);
		}

		const tenStarWeapons = await XRankPlacementRepository.findTenStarWeaponsBy(
			{ userId },
			{ limit: mainWeaponIds.length },
		);
		const tenStarWeaponSplIds = tenStarWeapons.map(
			(weapon) => weapon.weaponSplId,
		);

		return settings.weaponPool.map((weapon) => ({
			weaponSplId: weapon.id,
			isFavorite: weapon.isFavorite ? 1 : 0,
			isTenStar: tenStarWeaponSplIds.includes(weapon.id) ? 1 : 0,
		}));
	},
	"custom-kits": async (
		_userId: number,
		settings: ExtractWidgetSettings<"custom-kits">,
	) => {
		return settings.kits;
	},
	"social-links": async (userId: number) => {
		const user = await UserRepository.findById(userId);

		return user ? socialLinks(user) : [];
	},
	links: async (_userId: number, settings: ExtractWidgetSettings<"links">) => {
		return settings.links;
	},
	"game-badges": async (
		_userId: number,
		settings: ExtractWidgetSettings<"game-badges">,
	) => {
		return settings.badgeIds;
	},
	"game-badges-small": async (
		_userId: number,
		settings: ExtractWidgetSettings<"game-badges-small">,
	) => {
		return settings.badgeIds;
	},
	friends: async (userId: number) => {
		return FriendRepository.findFriendsByUserId(userId);
	},
	"luti-div": async (userId: number) => {
		const user = await UserRepository.findById(userId);
		if (!user?.div) return null;

		return { div: user.div, divSeason: user.divSeason };
	},
	"map-mode-preferences": async (userId: number) => {
		const preferences =
			await MatchProfileRepository.findMapModePreferencesByUserId(userId);
		if (!preferences) return [];

		return modesShort.flatMap((mode) => {
			const preference = preferences.modes.find(
				(m) => m.mode === mode,
			)?.preference;
			if (preference === "AVOID") return [];

			const stages = (
				preferences.pool.find((p) => p.mode === mode)?.stages ?? []
			).filter((stageId) => !BANNED_MAPS[mode].includes(stageId));
			if (stages.length === 0) return [];

			return { mode, stages };
		});
	},
	"live-stream": async (userId: number) => {
		return LiveStreamRepository.findByUserId(userId);
	},
};

async function getTop500WeaponsByCategory(
	userId: number,
	categoryName?: string,
) {
	const placements = await XRankPlacementRepository.placements()
		.claimedBy(userId)
		.execute();

	if (placements.length === 0) {
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

function trophyPreferencesOf(userId: number) {
	return UserRepository.users()
		.where({ id: userId })
		.withColumns(["favoriteTrophyIds", "hiddenTrophyIds", "patronTier"]);
}

function authorsPosts(authorId: number) {
	return LFGRepository.posts()
		.where({ authorId })
		.visibleToActor()
		.newestFirst();
}

function peakPlacementOf(userId: number) {
	return XRankPlacementRepository.placements()
		.claimedBy(userId)
		.highestPowerFirst()
		.limit(1);
}

function socialLinks(
	user: Pick<
		Tables["User"],
		"twitch" | "youtubeId" | "youtubeName" | "bsky" | "discordUniqueName"
	>,
) {
	const links: Array<
		| {
				type: "url";
				platform: "twitch" | "youtube" | "bsky";
				/** Account name on the platform, null if only an id is known */
				name: string | null;
				url: string;
		  }
		| { type: "text"; platform: "discord"; name: string }
	> = [];

	if (user.twitch) {
		links.push({
			type: "url",
			platform: "twitch",
			name: user.twitch,
			url: twitchUrl(user.twitch),
		});
	}
	if (user.youtubeId) {
		links.push({
			type: "url",
			platform: "youtube",
			name: user.youtubeName,
			url: youtubeUrl(user.youtubeId),
		});
	}
	if (user.bsky) {
		links.push({
			type: "url",
			platform: "bsky",
			name: user.bsky,
			url: bskyUrl(user.bsky),
		});
	}
	if (user.discordUniqueName) {
		links.push({
			type: "text",
			platform: "discord",
			name: user.discordUniqueName,
		});
	}

	return links;
}
