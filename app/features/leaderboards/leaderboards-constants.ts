import { mainWeaponIds, weaponCategories } from "~/modules/in-game-lists";
import { rankedModesShort } from "~/modules/in-game-lists/modes";

export const MATCHES_COUNT_NEEDED_FOR_LEADERBOARD = 7;
export const DEFAULT_LEADERBOARD_MAX_SIZE = 500;
export const WEAPON_LEADERBOARD_MAX_SIZE = 100;

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

/** Teams that are ignored from the main leaderboard, because e.g. they want to qualify with another group.
 * Map key is season.
 */
export const IGNORED_TEAMS: Map<number, number[][]> = new Map().set(5, [
	[9403, 13562, 15916, 38062], // Snooze
]);
