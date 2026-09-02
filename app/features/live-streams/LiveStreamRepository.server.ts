import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import { commonUserSelect, peakXpOverallSql } from "~/utils/kysely.server";
import * as StreamRanking from "../sidebar/core/StreamRanking";

export function replaceAll(streams: Omit<Tables["LiveStream"], "id">[]) {
	return db.transaction().execute(async (trx) => {
		await trx.deleteFrom("LiveStream").execute();

		await trx.insertInto("LiveStream").values(streams).execute();
	});
}

/** Adds the accounts as streamers of their tournament, returning the inserted ids in order; an account already streaming it is skipped. */
export function insertTournamentStreamers(
	rows: Omit<Tables["TournamentStreamer"], "id">[],
) {
	return db
		.insertInto("TournamentStreamer")
		.values(rows)
		.onConflict((oc) =>
			oc.columns(["twitchAccount", "tournamentId"]).doNothing(),
		)
		.returning("id")
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
