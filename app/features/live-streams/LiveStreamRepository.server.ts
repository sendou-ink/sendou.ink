import { db } from "~/db/sql";
import type { Tables, TablesInsertable } from "~/db/tables";
import { peakXpOverallSql } from "~/features/top-search/XRankPlacementRepository.server";
import { commonUserSelect } from "~/utils/kysely.server";
import * as StreamRanking from "../sidebar/core/StreamRanking";

export function replaceAll(
	streams: Omit<TablesInsertable["LiveStream"], "id">[],
) {
	return db.transaction().execute(async (trx) => {
		await trx.deleteFrom("LiveStream").execute();

		if (streams.length > 0) {
			await trx.insertInto("LiveStream").values(streams).execute();
		}
	});
}

export function insertTournamentStreamers(
	rows: Omit<Tables["TournamentStreamer"], "id">[],
) {
	if (rows.length === 0) return;

	return db
		.insertInto("TournamentStreamer")
		.values(rows)
		.onConflict((oc) =>
			oc.columns(["twitchAccount", "tournamentId"]).doNothing(),
		)
		.execute();
}

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
