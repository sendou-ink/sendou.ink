import type { getLeaderboards } from "./leaderboards.remote.ts";

export type LeaderboardsData = Awaited<ReturnType<typeof getLeaderboards>>;

export type UserLeaderboardEntry = NonNullable<
	LeaderboardsData["userLeaderboard"]
>[number];

export type TeamLeaderboardEntry = NonNullable<
	LeaderboardsData["teamLeaderboard"]
>[number];

export type XPLeaderboardEntry = NonNullable<
	LeaderboardsData["xpLeaderboard"]
>[number];

export type OwnEntryPeekData = NonNullable<LeaderboardsData["ownEntryPeek"]>;
