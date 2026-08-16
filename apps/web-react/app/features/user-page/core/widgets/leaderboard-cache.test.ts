import { describe, expect, test, vi } from "vitest";

// One finished season, one user sitting at rank 5 (so: top-10 AND top-100).
vi.mock("~/features/mmr/core/Seasons", () => ({
	allFinished: () => [1],
}));
vi.mock("~/features/leaderboards/LeaderboardRepository.server", () => ({
	findUserSPLeaderboard: async () => [{ id: 100, placementRank: 5 }],
}));

import { cachedUserSQLeaderboardTopData } from "./utils.server";

describe("SendouQ leaderboard widget cache", () => {
	test("counts a season once when the cache is filled concurrently", async () => {
		// This is exactly how UserRepository.findWidgetsByUserId drives it: the
		// top-10-seasons and top-100-seasons widgets both call the cache inside the
		// same Promise.all, so a cold cache is populated by two concurrent callers.
		const [cache] = await Promise.all([
			cachedUserSQLeaderboardTopData(),
			cachedUserSQLeaderboardTopData(),
		]);

		const user = cache.get(100)!;

		expect(user.TOP_10.times).toBe(1);
		expect(user.TOP_10.seasons).toEqual([1]);
	});
});
