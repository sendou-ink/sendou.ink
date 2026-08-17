/**
 * Trimmed port of the React app's `lfg-constants.ts`: only what the migrated
 * features need. `TEAM_POST_TYPES` and `TIMEZONES` arrive with the lfg
 * migration.
 */

export const LFG_TYPES = [
	"PLAYER_FOR_TEAM",
	"PLAYER_FOR_COACH",
	"TEAM_FOR_PLAYER",
	"TEAM_FOR_COACH",
	"TEAM_FOR_SCRIM",
	"COACH_FOR_TEAM",
] as const;

export type LFGType = (typeof LFG_TYPES)[number];

export const LFG = {
	MIN_TEXT_LENGTH: 1,
	MAX_TEXT_LENGTH: 2_000,
	POST_FRESHNESS_DAYS: 30 as const,
	MAX_WEAPON_FILTERS: 10,
	POSTS_PER_PAGE: 24,
	types: LFG_TYPES,
};
