import { subDays } from "date-fns";
import type { Insertable } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import { dateToDatabaseTimestamp } from "~/utils/dates";

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
			"TournamentMatchVod.platform",
			"TournamentMatchVod.account",
			"TournamentMatchVod.vodId",
			"TournamentMatchVod.timestampSeconds",
			"TournamentMatchVod.viewCount",
		])
		.where("TournamentStage.tournamentId", "=", tournamentId)
		.orderBy("TournamentMatchVod.viewCount", "desc")
		.execute();
}

export function insertMany(vods: Insertable<DB["TournamentMatchVod"]>[]) {
	if (vods.length === 0) return;

	return db.insertInto("TournamentMatchVod").values(vods).execute();
}

export function findFinalizedTournamentsNeedingVods() {
	const oneDayAgo = dateToDatabaseTimestamp(subDays(new Date(), 1));

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
		.where("CalendarEventDate.startTime", ">", oneDayAgo)
		.where(({ eb, selectFrom }) =>
			eb(
				selectFrom("TournamentMatchVod")
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
					.select(({ fn }) => [fn.countAll<number>().as("count")])
					.whereRef("TournamentStage.tournamentId", "=", "Tournament.id"),
				"=",
				0,
			),
		)
		.execute();
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
		.select((eb) => [
			"TournamentMatch.id",
			"TournamentMatch.startedAt",
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
