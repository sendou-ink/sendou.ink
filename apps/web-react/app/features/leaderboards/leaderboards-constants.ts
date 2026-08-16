import { rankedModesShort } from "~/modules/in-game-lists/modes";
import {
	mainWeaponIds,
	weaponCategories,
} from "~/modules/in-game-lists/weapon-ids";

export const MATCHES_COUNT_NEEDED_FOR_LEADERBOARD = 7;
export const DEFAULT_LEADERBOARD_MAX_SIZE = 500;
export const WEAPON_LEADERBOARD_MAX_SIZE = 100;
/** How many teams of the team leaderboard qualify, the divider being shown below the last of them. */
export const TEAM_LEADERBOARD_QUALIFYING_COUNT = 12;

export const LEADERBOARD_TYPES = [
	"USER",
	"TEAM",
	"TEAM-ALL",
	...(weaponCategories.map(
		(category) => `USER-${category.name}`,
	) as `USER-${(typeof weaponCategories)[number]["name"]}`[]),
	"XP-ALL",
	...(rankedModesShort.map(
		(mode) => `XP-MODE-${mode}`,
	) as `XP-MODE-${(typeof rankedModesShort)[number]}`[]),
	...(mainWeaponIds.map(
		(id) => `XP-WEAPON-${id}`,
	) as `XP-WEAPON-${(typeof mainWeaponIds)[number]}`[]),
] as const;
