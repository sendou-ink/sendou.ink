/** Multiplier turning an openskill ordinal into SP. */
export const SP_PER_ORDINAL = 15;

/** SP of an ordinal of 0, i.e. the SP a fresh rating starts at. */
export const SP_BASE = 1000;

export const TIERS = [
	{
		name: "LEVIATHAN",
		percentile: 5,
	},
	{
		name: "DIAMOND",
		percentile: 10,
	},
	{
		name: "PLATINUM",
		percentile: 15,
	},
	{
		name: "GOLD",
		percentile: 17.5,
	},
	{
		name: "SILVER",
		percentile: 20,
	},
	{
		name: "BRONZE",
		percentile: 17.5,
	},
	{
		name: "IRON",
		percentile: 15,
	},
] as const;

export const TIERS_BEFORE_LEVIATHAN = [
	{
		name: "DIAMOND",
		percentile: 15,
	},
	{
		name: "PLATINUM",
		percentile: 15,
	},
	{
		name: "GOLD",
		percentile: 17.5,
	},
	{
		name: "SILVER",
		percentile: 20,
	},
	{
		name: "BRONZE",
		percentile: 17.5,
	},
	{
		name: "IRON",
		percentile: 15,
	},
] as const;

export type TierName = (typeof TIERS)[number]["name"];

/** `Skill.season` of the dummy skill inserted to close a canceled match without a skill change. */
export const CANCELED_MATCH_SEASON = -1;

export const USER_LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN = 200;
export const TEAM_LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN = 100;
