import { sql } from "kysely";
import { db } from "~/db/sql";
import { MATCHES_COUNT_NEEDED_FOR_LEADERBOARD } from "../leaderboards/leaderboards-constants";

export async function seasonProgressionByUserId({
	userId,
	season,
}: {
	userId: number;
	season: number;
}) {
	return db
		.selectFrom("Skill")
		.leftJoin("GroupMatch", "GroupMatch.id", "Skill.groupMatchId")
		.leftJoin("Tournament", "Tournament.id", "Skill.tournamentId")
		.leftJoin("CalendarEvent", "Tournament.id", "CalendarEvent.tournamentId")
		.leftJoin(
			"CalendarEventDate",
			"CalendarEvent.id",
			"CalendarEventDate.eventId",
		)
		.select(({ fn }) => [
			fn.max("Skill.ordinal").as("ordinal"),
			sql<string>`date(coalesce("GroupMatch"."createdAt", "CalendarEventDate"."startTime"), 'unixepoch')`.as(
				"date",
			),
		])
		.where("Skill.userId", "=", userId)
		.where("Skill.season", "=", season)
		.where("Skill.matchesCount", ">=", MATCHES_COUNT_NEEDED_FOR_LEADERBOARD)
		.where(({ or, eb }) =>
			or([
				eb("GroupMatch.id", "is not", null),
				eb("Tournament.id", "is not", null),
			]),
		)
		.groupBy("date")
		.orderBy("date", "asc")
		.execute();
}
