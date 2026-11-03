import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "~/features/leaderboards/leaderboards-constants";
import {
	commonUserSelect,
	isLiveStreamOf,
	peakXpOverallSql,
} from "~/utils/kysely.server";
import * as StreamRanking from "../sidebar/core/StreamRanking";

export function replaceAll(streams: Omit<Tables["LiveStream"], "id">[]) {
	return db.transaction().execute(async (trx) => {
		// biome-ignore lint/plugin: replaces every stream with the given ones
		await trx.deleteFrom("LiveStream").execute();

		if (streams.length === 0) return;

		await trx.insertInto("LiveStream").values(streams).execute();
	});
}

/** Adds the accounts as streamers of their tournament, returning the inserted ids in order; an account already streaming it is skipped. */
export async function insertTournamentStreamers(
	rows: Omit<Tables["TournamentStreamer"], "id">[],
) {
	if (rows.length === 0) return [];

	return db
		.insertInto("TournamentStreamer")
		.values(rows)
		.onConflict((oc) =>
			oc.columns(["platform", "account", "tournamentId"]).doNothing(),
		)
		.returning("id")
		.execute();
}

/** The user's ongoing Splatoon 3 streams on their connected accounts, one per platform they are live on, most viewed first. */
export function findByUserId(userId: number) {
	return db
		.selectFrom("LiveStream")
		.select([
			"LiveStream.platform",
			"LiveStream.account",
			"LiveStream.videoId",
			"LiveStream.viewerCount",
			"LiveStream.thumbnailUrl",
		])
		.where("LiveStream.userId", "=", userId)
		.orderBy("LiveStream.viewerCount", "desc")
		.execute();
}

/** Live streams (on their connected accounts) of high X Power players with a calculated skill (enough sets for the leaderboard) in season `season` or the one before it. */
export function findXRankStreams(season: number) {
	return db
		.selectFrom("LiveStream")
		.innerJoin("User", (join) => join.on(isLiveStreamOf()))
		.innerJoin("SplatoonPlayer", "SplatoonPlayer.userId", "User.id")
		.where(peakXpOverallSql(), ">=", StreamRanking.minXpForStreamToBeShown())
		.where((eb) =>
			eb.exists(
				eb
					.selectFrom("Skill")
					.select("Skill.id")
					.whereRef("Skill.userId", "=", "User.id")
					.where("Skill.season", "in", [season - 1, season])
					.where(
						"Skill.matchesCount",
						">=",
						MATCHES_COUNT_NEEDED_FOR_LEADERBOARD,
					),
			),
		)
		.select((eb) => [
			...commonUserSelect(eb),
			peakXpOverallSql<number>().as("peakXp"),
			"LiveStream.viewerCount",
			"LiveStream.thumbnailUrl",
			"LiveStream.platform",
			"LiveStream.account",
			"LiveStream.videoId",
		])
		.execute();
}
