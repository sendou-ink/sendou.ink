import { subDays, subHours } from "date-fns";
import { sql } from "kysely";
import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import {
	commonUserSelect,
	jsonArrayFrom,
	jsonObjectFrom,
} from "~/utils/kysely.server";
import { TOURNAMENT } from "../tournament/tournament-constants";

export type VodsByTournamentId = Awaited<
	ReturnType<typeof findVodsByTournamentId>
>;
export function findVodsByTournamentId(tournamentId: number) {
	return db
		.selectFrom("TournamentMatchVod")
		.innerJoin(
			"TournamentMatch",
			"TournamentMatch.id",
			"TournamentMatchVod.matchId",
		)
		.innerJoin(
			"TournamentStage",
			"TournamentStage.id",
			"TournamentMatch.stageId",
		)
		.select((eb) => [
			"TournamentMatchVod.matchId",
			"TournamentMatchVod.userId",
			"TournamentMatchVod.platform",
			"TournamentMatchVod.account",
			"TournamentMatchVod.platformVideoId",
			"TournamentMatchVod.timestampSeconds",
			"TournamentMatchVod.viewCount",
			jsonObjectFrom(
				eb
					.selectFrom("User")
					.select((innerEb) => commonUserSelect(innerEb))
					.whereRef("User.id", "=", "TournamentMatchVod.userId"),
			).as("user"),
			eb
				.selectFrom("TournamentTeam")
				.innerJoin(
					"TournamentTeamMember",
					"TournamentTeamMember.tournamentTeamId",
					"TournamentTeam.id",
				)
				.select("TournamentTeam.name")
				.whereRef(
					"TournamentTeamMember.userId",
					"=",
					"TournamentMatchVod.userId",
				)
				.where(
					sql<boolean>`"TournamentTeam"."id" in (json_extract("TournamentMatch"."opponentOne", '$.id'), json_extract("TournamentMatch"."opponentTwo", '$.id'))`,
				)
				.as("teamName"),
		])
		.where("TournamentStage.tournamentId", "=", tournamentId)
		.orderBy("TournamentMatchVod.viewCount", "desc")
		.execute();
}

/**
 * Every VoD of the tournament with what is needed to download its match: its round, when the match started and
 * when its last game was reported, plus the streamer and the team whose POV the VoD is and how many sets that team
 * won (`null` for casts).
 */
export async function findAllForDownloadByTournamentId(tournamentId: number) {
	const vods = await db
		.selectFrom("TournamentMatchVod")
		.innerJoin(
			"TournamentMatch",
			"TournamentMatch.id",
			"TournamentMatchVod.matchId",
		)
		.innerJoin(
			"TournamentStage",
			"TournamentStage.id",
			"TournamentMatch.stageId",
		)
		.innerJoin(
			"TournamentRound",
			"TournamentRound.id",
			"TournamentMatch.roundId",
		)
		.select((eb) => [
			"TournamentMatchVod.matchId",
			"TournamentMatchVod.platform",
			"TournamentMatchVod.account",
			"TournamentMatchVod.userId",
			"TournamentMatchVod.platformVideoId",
			"TournamentMatchVod.timestampSeconds",
			"TournamentMatch.startedAt",
			"TournamentStage.type as stageType",
			"TournamentRound.number as roundNumber",
			"TournamentRound.section as roundSection",
			eb
				.selectFrom("TournamentMatchGameResult")
				.select((innerEb) =>
					innerEb.fn.max("TournamentMatchGameResult.createdAt").as("createdAt"),
				)
				.whereRef(
					"TournamentMatchGameResult.matchId",
					"=",
					"TournamentMatch.id",
				)
				.as("lastGameReportedAt"),
			eb
				.selectFrom("TournamentTeamMember")
				.select("TournamentTeamMember.tournamentTeamId")
				.whereRef(
					"TournamentTeamMember.userId",
					"=",
					"TournamentMatchVod.userId",
				)
				.where(
					sql<boolean>`"TournamentTeamMember"."tournamentTeamId" in (json_extract("TournamentMatch"."opponentOne", '$.id'), json_extract("TournamentMatch"."opponentTwo", '$.id'))`,
				)
				.as("povTeamId"),
		])
		.where("TournamentStage.tournamentId", "=", tournamentId)
		.orderBy("TournamentMatchVod.matchId", "asc")
		.execute();
	const finishedMatches = await db
		.selectFrom("TournamentMatch")
		.innerJoin(
			"TournamentStage",
			"TournamentStage.id",
			"TournamentMatch.stageId",
		)
		.select([
			"TournamentMatch.opponentOne",
			"TournamentMatch.opponentTwo",
			"TournamentMatch.winnerSide",
		])
		.where("TournamentStage.tournamentId", "=", tournamentId)
		.where("TournamentMatch.winnerSide", "is not", null)
		.execute();

	const setWinsByTeamId = new Map<number, number>();
	for (const match of finishedMatches) {
		const winnerId =
			match.winnerSide === "opponent1"
				? match.opponentOne?.id
				: match.opponentTwo?.id;
		if (typeof winnerId !== "number") continue;

		setWinsByTeamId.set(winnerId, (setWinsByTeamId.get(winnerId) ?? 0) + 1);
	}

	return vods.map((vod) => ({
		...vod,
		povTeamSetWins:
			vod.povTeamId === null ? null : (setWinsByTeamId.get(vod.povTeamId) ?? 0),
	}));
}

export function insertMany(vods: Omit<Tables["TournamentMatchVod"], "id">[]) {
	return db
		.insertInto("TournamentMatchVod")
		.values(vods)
		.onConflict((oc) =>
			oc.columns(["matchId", "account"]).doUpdateSet((eb) => ({
				viewCount: eb.ref("excluded.viewCount"),
				timestampSeconds: eb.ref("excluded.timestampSeconds"),
				platformVideoId: eb.ref("excluded.platformVideoId"),
				checkAfter: eb.ref("excluded.checkAfter"),
			})),
		)
		.execute();
}

/** IDs of the Twitch videos due a check, each once however many matches it covers, longest overdue first. */
export async function findTwitchVideoIdsDueCheck(limit: number) {
	const rows = await db
		.selectFrom("TournamentMatchVod")
		.select("platformVideoId")
		.where("platform", "=", "TWITCH")
		.where("checkAfter", "<=", databaseTimestampNow())
		.groupBy("platformVideoId")
		.orderBy((eb) => eb.fn.min("checkAfter"), "asc")
		.limit(limit)
		.execute();

	return rows.map((row) => row.platformVideoId);
}

/**
 * Saves a check of Twitch videos: the VoDs of `removedVideoIds` are deleted, those of `foundVideos` get the
 * fresh view count and their next check at `nextCheckAfter`.
 */
export function saveTwitchVideoCheck({
	removedVideoIds,
	foundVideos,
	nextCheckAfter,
}: {
	removedVideoIds: string[];
	foundVideos: Array<{ videoId: string; viewCount: number }>;
	nextCheckAfter: number;
}) {
	return db.transaction().execute(async (trx) => {
		if (removedVideoIds.length > 0) {
			await trx
				.deleteFrom("TournamentMatchVod")
				.where("platform", "=", "TWITCH")
				.where("platformVideoId", "in", removedVideoIds)
				.execute();
		}

		for (const video of foundVideos) {
			await trx
				.updateTable("TournamentMatchVod")
				.set({ viewCount: video.viewCount, checkAfter: nextCheckAfter })
				.where("platform", "=", "TWITCH")
				.where("platformVideoId", "=", video.videoId)
				.execute();
		}
	});
}

/**
 * Finalized tournaments due a VoD sync: never synced yet while their VoDs are still shown (multi-day tournaments
 * finalize well after their start), or synced once 3-6 hours ago to catch VoDs published late.
 */
export function findTournamentsNeedingVodSync() {
	const vodVisibilityCutoff = dateToDatabaseTimestamp(
		subDays(new Date(), TOURNAMENT.VOD_VISIBILITY_DAYS),
	);
	const threeHoursAgo = dateToDatabaseTimestamp(subHours(new Date(), 3));
	const sixHoursAgo = dateToDatabaseTimestamp(subHours(new Date(), 6));

	return db
		.selectFrom("Tournament")
		.innerJoin("CalendarEvent", "Tournament.id", "CalendarEvent.tournamentId")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEvent.id",
			"CalendarEventDate.eventId",
		)
		.select(["Tournament.id"])
		.where("Tournament.isFinalized", "=", 1)
		.where(({ or, and, eb }) =>
			or([
				and([
					eb("CalendarEventDate.startsAt", ">", vodVisibilityCutoff),
					eb("Tournament.vodsSyncCount", "=", 0),
				]),
				and([
					eb("Tournament.vodsSyncCount", "=", 1),
					eb("Tournament.vodsLastSyncAt", "<=", threeHoursAgo),
					eb("Tournament.vodsLastSyncAt", ">", sixHoursAgo),
				]),
			]),
		)
		.execute();
}

export function markVodSyncCompleted(tournamentId: number) {
	return db
		.updateTable("Tournament")
		.set((eb) => ({
			vodsLastSyncAt: databaseTimestampNow(),
			vodsSyncCount: eb("vodsSyncCount", "+", 1),
		}))
		.where("id", "=", tournamentId)
		.execute();
}

export function deleteObsolete() {
	const cutoff = dateToDatabaseTimestamp(
		subDays(new Date(), TOURNAMENT.VOD_VISIBILITY_DAYS),
	);

	return db
		.deleteFrom("TournamentMatchVod")
		.where(
			"matchId",
			"in",
			db
				.selectFrom("TournamentMatch")
				.innerJoin(
					"TournamentStage",
					"TournamentStage.id",
					"TournamentMatch.stageId",
				)
				.innerJoin(
					"CalendarEvent",
					"CalendarEvent.tournamentId",
					"TournamentStage.tournamentId",
				)
				.innerJoin(
					"CalendarEventDate",
					"CalendarEventDate.eventId",
					"CalendarEvent.id",
				)
				.select("TournamentMatch.id")
				.where("CalendarEventDate.startsAt", "<", cutoff),
		)
		.executeTakeFirst();
}

export function findStreamersByTournamentId(tournamentId: number) {
	return db
		.selectFrom("TournamentStreamer")
		.select([
			"TournamentStreamer.platform",
			"TournamentStreamer.account",
			"TournamentStreamer.userId",
		])
		.where("TournamentStreamer.tournamentId", "=", tournamentId)
		.execute();
}

export function findMatchesWithStartedAt(tournamentId: number) {
	return db
		.selectFrom("TournamentMatch")
		.innerJoin(
			"TournamentStage",
			"TournamentStage.id",
			"TournamentMatch.stageId",
		)
		.innerJoin(
			"TournamentRound",
			"TournamentRound.id",
			"TournamentMatch.roundId",
		)
		.select((eb) => [
			"TournamentMatch.id",
			"TournamentMatch.startedAt",
			"TournamentStage.type as stageType",
			"TournamentRound.number as roundNumber",
			"TournamentRound.section as roundSection",
			jsonArrayFrom(
				eb
					.selectFrom("TournamentMatchGameResultParticipant")
					.innerJoin(
						"TournamentMatchGameResult",
						"TournamentMatchGameResult.id",
						"TournamentMatchGameResultParticipant.matchGameResultId",
					)
					.select(["TournamentMatchGameResultParticipant.userId"])
					.whereRef(
						"TournamentMatchGameResult.matchId",
						"=",
						"TournamentMatch.id",
					)
					.groupBy("TournamentMatchGameResultParticipant.userId"),
			).as("participants"),
		])
		.where("TournamentStage.tournamentId", "=", tournamentId)
		.where("TournamentMatch.startedAt", "is not", null)
		.execute();
}

export async function findCastedMatchHistoryByTournamentId(
	tournamentId: number,
) {
	const result = await db
		.selectFrom("Tournament")
		.select("Tournament.castedMatchesInfo")
		.where("Tournament.id", "=", tournamentId)
		.executeTakeFirst();

	return result?.castedMatchesInfo?.castedMatchHistory ?? [];
}
