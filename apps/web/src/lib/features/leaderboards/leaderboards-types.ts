import type {
	getLeaderboards,
	getXPLeaderboard,
} from "./leaderboards.remote.ts";

export type LeaderboardsData = Awaited<ReturnType<typeof getLeaderboards>>;

export type UserLeaderboardEntry = NonNullable<
	LeaderboardsData["userLeaderboard"]
>[number];

export type TeamLeaderboardEntry = NonNullable<
	LeaderboardsData["teamLeaderboard"]
>[number];

export type XPLeaderboardEntry = Awaited<
	ReturnType<typeof getXPLeaderboard>
>[number];

export type OwnEntryPeekData = NonNullable<LeaderboardsData["ownEntryPeek"]>;
