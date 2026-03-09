import * as LeaderboardRepository from "~/features/leaderboards/LeaderboardRepository.server";
import * as Seasons from "~/features/mmr/core/Seasons";

type LeaderboardTopData = {
	times: number;
	seasons: number[];
};

const sqLeaderboardTopCache = new Map<
	number,
	{
		TOP_10: LeaderboardTopData;
		TOP_100: LeaderboardTopData;
	}
>();

export async function cachedUserSQLeaderboardTopData() {
	if (sqLeaderboardTopCache.size > 0) {
		return sqLeaderboardTopCache;
	}

	const allSeasons = Seasons.allFinished();

	for (const season of allSeasons) {
		const leaderboard = await LeaderboardRepository.userSPLeaderboard(season);

		for (const entry of leaderboard) {
			const userId = entry.id;
			const placementRank = entry.placementRank;

			if (!sqLeaderboardTopCache.has(userId)) {
				sqLeaderboardTopCache.set(userId, {
					TOP_10: { times: 0, seasons: [] },
					TOP_100: { times: 0, seasons: [] },
				});
			}

			const userData = sqLeaderboardTopCache.get(userId)!;

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

	return sqLeaderboardTopCache;
}
