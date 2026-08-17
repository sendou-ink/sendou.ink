import type { Unwrapped } from "@sendou/utils/types";
import { type NotNull, sql } from "kysely";
import { db } from "#lib/server/db/sql.ts";
import {
	commonUserSelect,
	concatUserSubmittedImagePrefix,
	jsonArrayFrom,
	jsonObjectFrom,
	tournamentLogoWithDefault,
	tournamentMembersCount,
	tournamentTeamsCount,
} from "#lib/server/kysely.ts";
import {
	databaseTimestampNow,
	dateToDatabaseTimestamp,
} from "#lib/utils/dates.ts";

export type ForShowcase = Unwrapped<typeof findAllForShowcase>;

/** Tournaments of the last week and upcoming ones, with the aggregates the showcase/sidebar need. */
export function findAllForShowcase() {
	return db
		.selectFrom("Tournament")
		.innerJoin("CalendarEvent", "Tournament.id", "CalendarEvent.tournamentId")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEvent.id",
			"CalendarEventDate.eventId",
		)
		.select((eb) => [
			"Tournament.id",
			"Tournament.settings",
			"Tournament.tier",
			"Tournament.isFinalized",
			"CalendarEvent.authorId",
			"CalendarEvent.name",
			"CalendarEvent.organizationId",
			"CalendarEventDate.startsAt",
			"CalendarEvent.hidden",
			tournamentTeamsCount(eb).as("teamsCount"),
			tournamentMembersCount(eb).as("membersCount"),
			tournamentLogoWithDefault(eb).as("logoUrl"),
			jsonObjectFrom(
				eb
					.selectFrom("TournamentOrganization")
					.select([
						"TournamentOrganization.name",
						"TournamentOrganization.slug",
					])
					.whereRef(
						"TournamentOrganization.id",
						"=",
						"CalendarEvent.organizationId",
					),
			).as("organization"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentResult")
					.innerJoin("User", "TournamentResult.userId", "User.id")
					.innerJoin(
						"TournamentTeam",
						"TournamentResult.tournamentTeamId",
						"TournamentTeam.id",
					)
					.leftJoin("AllTeam", "TournamentTeam.teamId", "AllTeam.id")
					.leftJoin(
						"UserSubmittedImage as TeamAvatar",
						"AllTeam.avatarImgId",
						"TeamAvatar.id",
					)
					.leftJoin(
						"UserSubmittedImage as TournamentTeamAvatar",
						"TournamentTeam.avatarImgId",
						"TournamentTeamAvatar.id",
					)
					.whereRef("TournamentResult.tournamentId", "=", "Tournament.id")
					.where("TournamentResult.placement", "=", 1)
					.select((eb) => [
						...commonUserSelect(eb, { inTournament: true }),
						"User.country",
						"TournamentResult.div",
						"TournamentTeam.name as teamName",
						concatUserSubmittedImagePrefix(eb.ref("TeamAvatar.url")).as(
							"teamLogoUrl",
						),
						concatUserSubmittedImagePrefix(
							eb.ref("TournamentTeamAvatar.url"),
						).as("pickupAvatarUrl"),
					]),
			).as("firstPlacers"),
			eb
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
				.whereRef("TournamentStage.tournamentId", "=", "Tournament.id")
				.select(({ fn }) => [fn.countAll<number>().as("count")])
				.as("vodCount"),
		])
		.where("CalendarEventDate.startsAt", ">", databaseTimestampWeekAgo())
		.orderBy("CalendarEventDate.startsAt", "asc")
		.$narrowType<{ teamsCount: NotNull; membersCount: NotNull }>()
		.execute();
}

function databaseTimestampWeekAgo() {
	const now = new Date();

	now.setDate(now.getDate() - 7);

	return dateToDatabaseTimestamp(now);
}

/** Team members, staff and author of the given tournaments, for participation categorization. */
export function findRelatedUsersByTournamentIds(tournamentIds: number[]) {
	return db
		.selectFrom("CalendarEventDate")
		.innerJoin("CalendarEvent", "CalendarEventDate.eventId", "CalendarEvent.id")
		.innerJoin("Tournament", "CalendarEvent.tournamentId", "Tournament.id")
		.select((eb) => [
			"Tournament.id",
			"CalendarEvent.authorId",
			jsonArrayFrom(
				eb
					.selectFrom("TournamentStaff")
					.select(["TournamentStaff.userId"])
					.whereRef("TournamentStaff.tournamentId", "=", "Tournament.id")
					.where("TournamentStaff.role", "=", "ORGANIZER"),
			).as("staff"),
			jsonArrayFrom(
				eb
					.selectFrom("TournamentTeam")
					.innerJoin(
						"TournamentTeamMember",
						"TournamentTeamMember.tournamentTeamId",
						"TournamentTeam.id",
					)
					.select(["TournamentTeamMember.userId"])
					.whereRef("TournamentTeam.tournamentId", "=", "Tournament.id"),
			).as("teamMembers"),
		])
		.where("Tournament.id", "in", tournamentIds)
		.$narrowType<{
			staff: NotNull;
			teamMembers: NotNull;
		}>()
		.execute();
}

/** How close to its start time a tournament counts as happening right now. */
const TOURNAMENT_ONGOING_WINDOW_IN_SECONDS = 24 * 60 * 60;

/**
 * Searches tournaments whose calendar event name contains the query, hidden events excluded.
 *
 * Ordered so that the tournaments most likely being looked for come first
 */
export async function searchByName({
	query,
	limit,
	minStartTime,
	maxStartTime,
}: {
	query: string;
	limit: number;
	minStartTime?: Date;
	maxStartTime?: Date;
}) {
	const now = databaseTimestampNow();
	const distanceFromNow = sql<number>`abs("CalendarEventDate"."startsAt" - ${now})`;
	// window function so that the next tournament up is the next one of all the matches,
	// not only of the ones that happen to fit in the limit
	const nextUpStartsAt = sql<number>`min(case when "CalendarEventDate"."startsAt" - ${now} >= ${TOURNAMENT_ONGOING_WINDOW_IN_SECONDS} then "CalendarEventDate"."startsAt" end) over ()`;

	let sqlQuery = db
		.selectFrom("Tournament")
		.innerJoin("CalendarEvent", "Tournament.id", "CalendarEvent.tournamentId")
		.innerJoin(
			"CalendarEventDate",
			"CalendarEvent.id",
			"CalendarEventDate.eventId",
		)
		.select((eb) => [
			"Tournament.id",
			"CalendarEvent.name",
			"CalendarEventDate.startsAt",
			tournamentLogoWithDefault(eb).as("logoUrl"),
		])
		.where("CalendarEvent.name", "like", `%${query}%`)
		.where("CalendarEvent.hidden", "=", 0)
		.orderBy(
			sql`case
				when ${distanceFromNow} < ${TOURNAMENT_ONGOING_WINDOW_IN_SECONDS} then 0
				when "CalendarEventDate"."startsAt" = ${nextUpStartsAt} then 1
				else 2
			end`,
		)
		.orderBy(distanceFromNow)
		.orderBy("Tournament.id")
		.limit(limit);

	if (minStartTime) {
		sqlQuery = sqlQuery.where(
			"CalendarEventDate.startsAt",
			">=",
			dateToDatabaseTimestamp(minStartTime),
		);
	}

	if (maxStartTime) {
		sqlQuery = sqlQuery.where(
			"CalendarEventDate.startsAt",
			"<=",
			dateToDatabaseTimestamp(maxStartTime),
		);
	}

	return sqlQuery.execute();
}
