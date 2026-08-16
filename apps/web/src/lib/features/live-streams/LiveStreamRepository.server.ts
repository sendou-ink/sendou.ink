import * as StreamRanking from "#lib/features/sidebar/StreamRanking.ts";
import { db } from "#lib/server/db/sql.ts";
import { commonUserSelect, peakXpOverallSql } from "#lib/server/kysely.ts";

/** Live streams of users with a high enough X Rank peak XP to show in the sidebar. */
export function findXRankStreams() {
	return db
		.selectFrom("LiveStream")
		.innerJoin("User", "User.twitch", "LiveStream.twitch")
		.innerJoin("SplatoonPlayer", "SplatoonPlayer.userId", "User.id")
		.where(peakXpOverallSql(), ">=", StreamRanking.minXpForStreamToBeShown())
		.where("LiveStream.twitch", "is not", null)
		.select((eb) => [
			...commonUserSelect(eb),
			peakXpOverallSql<number>().as("peakXp"),
			"LiveStream.viewerCount",
			"LiveStream.thumbnailUrl",
			"LiveStream.twitch as twitchUsername",
		])
		.execute();
}
