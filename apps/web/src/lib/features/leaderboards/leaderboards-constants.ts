import { rankedModesShort } from "@sendou/in-game-lists/modes";
import {
	mainWeaponIds,
	weaponCategories,
} from "@sendou/in-game-lists/weapon-ids";

export const MATCHES_COUNT_NEEDED_FOR_LEADERBOARD = 7;
export const DEFAULT_LEADERBOARD_MAX_SIZE = 500;
export const WEAPON_LEADERBOARD_MAX_SIZE = 100;
/** How many teams of the team leaderboard qualify, the divider being shown below the last of them. */
export const TEAM_LEADERBOARD_QUALIFYING_COUNT = 12;

export const SEASONAL_LEADERBOARD_TYPES = [
	"USER",
	"TEAM",
	"TEAM-ALL",
	...(weaponCategories.map(
		(category) => `USER-${category.name}`,
	) as `USER-${(typeof weaponCategories)[number]["name"]}`[]),
] as const;

export const XP_LEADERBOARD_TYPES = [
	"XP-ALL",
	...(rankedModesShort.map(
		(mode) => `XP-MODE-${mode}`,
	) as `XP-MODE-${(typeof rankedModesShort)[number]}`[]),
	...(mainWeaponIds.map(
		(id) => `XP-WEAPON-${id}`,
	) as `XP-WEAPON-${(typeof mainWeaponIds)[number]}`[]),
] as const;

export const LEADERBOARD_TYPES = [
	...SEASONAL_LEADERBOARD_TYPES,
	...XP_LEADERBOARD_TYPES,
] as const;

export type LeaderboardType = (typeof LEADERBOARD_TYPES)[number];

export type SeasonalLeaderboardType =
	(typeof SEASONAL_LEADERBOARD_TYPES)[number];

export type XPLeaderboardType = (typeof XP_LEADERBOARD_TYPES)[number];

export function isXPLeaderboardType(
	type: LeaderboardType,
): type is XPLeaderboardType {
	return type.startsWith("XP");
}
