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

// won 4 in row vs. equally skilled opponents, about 1200SP
export const DEFAULT_SKILL_HIGH = {
	mu: 34.970668845350744,
	sigma: 7.362186212527989,
} as const;

// lost 4 in row vs. equally skilled opponents, about 900SP
export const DEFAULT_SKILL_LOW = {
	mu: 15.02933115464926,
	sigma: 7.362186212527989,
} as const;

// won 2, lost 2 vs. equally skilled opponents, about 1050SP
export const DEFAULT_SKILL_MID = {
	mu: 25.189621801205735,
	sigma: 7.362186212527989,
} as const;

export const USER_LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN = 200;
export const TEAM_LEADERBOARD_MIN_ENTRIES_FOR_LEVIATHAN = 100;
