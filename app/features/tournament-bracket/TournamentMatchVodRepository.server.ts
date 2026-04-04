import { subDays, subHours } from "date-fns";
import type { Insertable } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
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
		.select([
			"TournamentMatchVod.matchId",
			"TournamentMatchVod.userId",
			"TournamentMatchVod.platform",
			"TournamentMatchVod.account",
			"TournamentMatchVod.platformVideoId",
			"TournamentMatchVod.timestampSeconds",
			"TournamentMatchVod.viewCount",
		])
		.where("TournamentStage.tournamentId", "=", tournamentId)
		.orderBy("TournamentMatchVod.viewCount", "desc")
		.execute();
}

export function insertMany(vods: Insertable<DB["TournamentMatchVod"]>[]) {
	if (vods.length === 0) return;

	return db
		.insertInto("TournamentMatchVod")
		.values(vods)
		.onConflict((oc) =>
			oc.columns(["matchId", "account"]).doUpdateSet((eb) => ({
				viewCount: eb.ref("excluded.viewCount"),
				timestampSeconds: eb.ref("excluded.timestampSeconds"),
				platformVideoId: eb.ref("excluded.platformVideoId"),
			})),
		)
		.execute();
}

export function findTournamentsNeedingVodSync() {
	const oneDayAgo = dateToDatabaseTimestamp(subDays(new Date(), 1));
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
					eb("CalendarEventDate.startTime", ">", oneDayAgo),
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
				.where("CalendarEventDate.startTime", "<", cutoff),
		)
		.executeTakeFirst();
}

export function findStreamersByTournamentId(tournamentId: number) {
	return db
		.selectFrom("TournamentStreamer")
		.select(["TournamentStreamer.twitchAccount", "TournamentStreamer.userId"])
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
		.innerJoin(
			"TournamentGroup",
			"TournamentGroup.id",
			"TournamentMatch.groupId",
		)
		.select((eb) => [
			"TournamentMatch.id",
			"TournamentMatch.startedAt",
			"TournamentStage.type as stageType",
			"TournamentRound.number as roundNumber",
			"TournamentGroup.number as groupNumber",
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
