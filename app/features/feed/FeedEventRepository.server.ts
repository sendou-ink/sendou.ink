import { sql } from "kysely";
import { db } from "~/db/sql";
import type { Tables } from "~/db/tables";
import { CANCELED_MATCH_SEASON } from "~/features/mmr/mmr-constants";
import { calendarEventStartTime } from "~/utils/kysely.server";
import type { FeedEventData, FeedEventType } from "./feed-types";

export type FeedIndexerSource = "SQ" | "TOURNAMENT";

/** Feed events of the users in the range. */
export function findAllByUserIds({
	userIds,
	from,
	to,
}: {
	userIds: number[];
	from: number;
	to: number;
}) {
	if (userIds.length === 0) return Promise.resolve([]);

	return db
		.selectFrom("FeedEvent")
		.select([
			"FeedEvent.userId",
			"FeedEvent.type",
			"FeedEvent.at",
			"FeedEvent.data",
		])
		.where("FeedEvent.userId", "in", userIds)
		.where("FeedEvent.at", ">=", from)
		.where("FeedEvent.at", "<=", to)
		.execute();
}

export async function findCursorBySource(source: FeedIndexerSource) {
	const row = await db
		.selectFrom("FeedIndexerCursor")
		.select("FeedIndexerCursor.position")
		.where("FeedIndexerCursor.source", "=", source)
		.executeTakeFirst();

	return row?.position;
}

/** Players of the SendouQ matches confirmed at or after `since`, with when each was confirmed. */
export function findUserIdsOfMatchesConfirmedSince(since: number) {
	return db
		.selectFrom("GroupMatch")
		.innerJoin("GroupMember", (join) =>
			join.on((eb) =>
				eb.or([
					eb("GroupMember.groupId", "=", eb.ref("GroupMatch.alphaGroupId")),
					eb("GroupMember.groupId", "=", eb.ref("GroupMatch.bravoGroupId")),
				]),
			),
		)
		.select(["GroupMember.userId", "GroupMatch.confirmedAt"])
		.where("GroupMatch.confirmedAt", ">=", since)
		.$narrowType<{ confirmedAt: number }>()
		.execute();
}

/** Players of the tournament results inserted after the result with the row id, with each result's row id. */
export function findUserIdsOfTournamentResultsAfterRowId(rowId: number) {
	return db
		.selectFrom("TournamentResult")
		.select([
			"TournamentResult.userId",
			sql<number>`"TournamentResult"."rowid"`.as("rowId"),
		])
		.where(sql<number>`"TournamentResult"."rowid"`, ">", rowId)
		.execute();
}

/** Players of the tournaments that started at or after `since`. */
export function findUserIdsOfTournamentsStartedSince(since: number) {
	return db
		.selectFrom("CalendarEventDate")
		.innerJoin("CalendarEvent", "CalendarEvent.id", "CalendarEventDate.eventId")
		.innerJoin(
			"TournamentResult",
			"TournamentResult.tournamentId",
			"CalendarEvent.tournamentId",
		)
		.select("TournamentResult.userId")
		.distinct()
		.where("CalendarEventDate.startsAt", ">=", since)
		.execute();
}

export async function findLatestTournamentResultRowId() {
	const row = await db
		.selectFrom("TournamentResult")
		.select(sql<number | null>`max("TournamentResult"."rowid")`.as("rowId"))
		.executeTakeFirst();

	return row?.rowId ?? 0;
}

/** Every rated SendouQ set of the user, with whether their group won and the tiers both groups had when it started. */
export function findAllSqPlaysByUserId(userId: number) {
	return db
		.selectFrom("Skill")
		.innerJoin("GroupMatch", "GroupMatch.id", "Skill.groupMatchId")
		.innerJoin("GroupMember", (join) =>
			join
				.onRef("GroupMember.userId", "=", "Skill.userId")
				.on((eb) =>
					eb.or([
						eb("GroupMember.groupId", "=", eb.ref("GroupMatch.alphaGroupId")),
						eb("GroupMember.groupId", "=", eb.ref("GroupMatch.bravoGroupId")),
					]),
				),
		)
		.innerJoin("Group as OwnGroup", "OwnGroup.id", "GroupMember.groupId")
		.innerJoin("Group as OpponentGroup", (join) =>
			join.on((eb) =>
				eb(
					"OpponentGroup.id",
					"=",
					eb
						.case()
						.when("GroupMember.groupId", "=", eb.ref("GroupMatch.alphaGroupId"))
						.then(eb.ref("GroupMatch.bravoGroupId"))
						.else(eb.ref("GroupMatch.alphaGroupId"))
						.end(),
				),
			),
		)
		.select((eb) => [
			"GroupMatch.id as matchId",
			"GroupMatch.createdAt as at",
			"Skill.season",
			"Skill.ordinal",
			"OwnGroup.tierName as ownTierName",
			"OwnGroup.tierIsPlus as ownTierIsPlus",
			"OpponentGroup.tierName as opponentTierName",
			"OpponentGroup.tierIsPlus as opponentTierIsPlus",
			eb
				.selectFrom("GroupMatchMap")
				.select((mapEb) => mapEb.fn.countAll<number>().as("c"))
				.whereRef("GroupMatchMap.matchId", "=", "GroupMatch.id")
				.whereRef("GroupMatchMap.winnerGroupId", "=", "GroupMember.groupId")
				.$asScalar()
				.$notNull()
				.as("mapWins"),
			eb
				.selectFrom("GroupMatchMap")
				.select((mapEb) => mapEb.fn.countAll<number>().as("c"))
				.whereRef("GroupMatchMap.matchId", "=", "GroupMatch.id")
				.where("GroupMatchMap.winnerGroupId", "is not", null)
				.$asScalar()
				.$notNull()
				.as("mapsPlayed"),
		])
		.where("Skill.userId", "=", userId)
		.where("Skill.season", "!=", CANCELED_MATCH_SEASON)
		.execute();
}

/** Every tournament result of the user with when the tournament started. */
export function findAllTournamentPlaysByUserId(userId: number) {
	return db
		.selectFrom("TournamentResult")
		.innerJoin(
			"CalendarEvent",
			"CalendarEvent.tournamentId",
			"TournamentResult.tournamentId",
		)
		.select((eb) => [
			"TournamentResult.tournamentId",
			"TournamentResult.tournamentTeamId",
			"TournamentResult.placement",
			"TournamentResult.participantCount",
			"TournamentResult.setResults",
			"CalendarEvent.name",
			"CalendarEvent.organizationId",
			calendarEventStartTime(eb).$asScalar().$notNull().as("at"),
		])
		.where("TournamentResult.userId", "=", userId)
		.execute();
}

/** Replaces every feed event of the user with `events`. */
export function replaceAllByUserId({
	userId,
	events,
}: {
	userId: number;
	events: Array<{ type: FeedEventType; at: number; data: FeedEventData }>;
}) {
	return db.transaction().execute(async (trx) => {
		await trx
			.deleteFrom("FeedEvent")
			.where("FeedEvent.userId", "=", userId)
			.execute();

		if (events.length === 0) return;

		await trx
			.insertInto("FeedEvent")
			.values(
				events.map((event) => ({
					userId,
					type: event.type,
					at: event.at,
					data: JSON.stringify(event.data),
				})),
			)
			.execute();
	});
}

export function deleteAllOfTypeBefore({
	type,
	before,
}: {
	type: FeedEventType;
	before: number;
}) {
	return db
		.deleteFrom("FeedEvent")
		.where("FeedEvent.type", "=", type)
		.where("FeedEvent.at", "<", before)
		.execute();
}

export function upsertCursor({
	source,
	position,
}: {
	source: FeedIndexerSource;
	position: Tables["FeedIndexerCursor"]["position"];
}) {
	return db
		.insertInto("FeedIndexerCursor")
		.values({ source, position })
		.onConflict((oc) => oc.column("source").doUpdateSet({ position }))
		.execute();
}
