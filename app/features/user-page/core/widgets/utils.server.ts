import { cachified } from "@epic-web/cachified";
import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { cache, IN_MILLISECONDS, ttl } from "~/utils/cache.server";

type LeaderboardTopData = {
	times: number;
	seasons: number[];
};

type UserSQLeaderboardTopData = Map<
	number,
	{
		TOP_10: LeaderboardTopData;
		TOP_100: LeaderboardTopData;
	}
>;

const SQ_LEADERBOARD_TOP_CACHE_KEY = "sq-leaderboard-top";

/** How many times & in what seasons each user placed in the SendouQ leaderboard top 10 and top 100. */
export function cachedUserSQLeaderboardTopData() {
	return cachified({
		key: SQ_LEADERBOARD_TOP_CACHE_KEY,
		cache,
		ttl: ttl(IN_MILLISECONDS.TWO_HOURS),
		getFreshValue: userSQLeaderboardTopData,
	});
}

async function userSQLeaderboardTopData(): Promise<UserSQLeaderboardTopData> {
	const result: UserSQLeaderboardTopData = new Map();

	for (const season of Seasons.allFinished()) {
		const leaderboard =
			await LeaderboardRepository.findUserSPLeaderboard(season);

		for (const entry of leaderboard) {
			const userId = entry.id;
			const placementRank = entry.placementRank;

			if (!result.has(userId)) {
				result.set(userId, {
					TOP_10: { times: 0, seasons: [] },
					TOP_100: { times: 0, seasons: [] },
				});
			}

			const userData = result.get(userId)!;

			if (placementRank <= 10) {
				userData.TOP_10.times += 1;
				userData.TOP_10.seasons.push(season);
			}

			if (placementRank <= 100) {
				userData.TOP_100.times += 1;
				userData.TOP_100.seasons.push(season);
			}
		}
	}

	return result;
}
