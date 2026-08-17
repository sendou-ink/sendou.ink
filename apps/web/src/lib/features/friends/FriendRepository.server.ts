import { type SelectQueryBuilder, sql } from "kysely";
import { db } from "#lib/server/db/sql.ts";
import type { DB } from "#lib/server/db/tables.ts";
import { commonUserSelect } from "#lib/server/kysely.ts";
import { dateToDatabaseTimestamp } from "#lib/utils/dates.ts";

/** The user's friends and current teammates with their tournament LFG data attached. */
export async function findByUserIdWithActivity(userId: number) {
	const [friendRows, teamMemberRows] = await Promise.all([
		withLfgJoins(
			db
				.selectFrom("Friendship")
				.innerJoin("User", (join) =>
					join.on((eb) =>
						eb.or([
							eb.and([
								eb("Friendship.userOneId", "=", userId),
								eb("User.id", "=", eb.ref("Friendship.userTwoId")),
							]),
							eb.and([
								eb("Friendship.userTwoId", "=", userId),
								eb("User.id", "=", eb.ref("Friendship.userOneId")),
							]),
						]),
					),
				)
				.where((eb) =>
					eb.or([
						eb("Friendship.userOneId", "=", userId),
						eb("Friendship.userTwoId", "=", userId),
					]),
				),
		)
			.select([
				"Friendship.id as friendshipId",
				"Friendship.createdAt as friendshipCreatedAt",
			])
			.orderBy("Friendship.createdAt", "desc")
			.execute(),
		withLfgJoins(
			db
				.selectFrom("TeamMemberWithSecondary as myMembership")
				.innerJoin("TeamMemberWithSecondary as otherMembership", (join) =>
					join
						.onRef("otherMembership.teamId", "=", "myMembership.teamId")
						.on("otherMembership.userId", "!=", userId),
				)
				.innerJoin("User", "User.id", "otherMembership.userId")
				.where("myMembership.userId", "=", userId),
		).execute(),
	]);

	return [
		...friendRows,
		...teamMemberRows.map((row) => ({
			...row,
			friendshipId: null as number | null,
			friendshipCreatedAt: null as number | null,
		})),
	];
}

function withLfgJoins<QB extends SelectQueryBuilder<any, any, any>>(qb: QB) {
	const nowTimestamp = dateToDatabaseTimestamp(new Date());

	return (qb as SelectQueryBuilder<DB, keyof DB, Record<string, never>>)
		.leftJoin("TournamentTeamMember", (join) =>
			join
				.onRef("TournamentTeamMember.userId", "=", "User.id")
				.on("TournamentTeamMember.isLooking", "=", 1),
		)
		.leftJoin(
			"TournamentTeam",
			"TournamentTeam.id",
			"TournamentTeamMember.tournamentTeamId",
		)
		.leftJoin("Tournament", (join) =>
			join
				.onRef("Tournament.id", "=", "TournamentTeam.tournamentId")
				.on((eb) =>
					eb.or([
						eb(
							sql`json_extract("Tournament"."settings", '$.regClosesAt')`,
							"is",
							null,
						),
						eb(
							sql<number>`json_extract("Tournament"."settings", '$.regClosesAt')`,
							">",
							nowTimestamp,
						),
					]),
				),
		)
		.leftJoin("CalendarEvent", "CalendarEvent.tournamentId", "Tournament.id")
		.leftJoin(
			"CalendarEventDate",
			"CalendarEventDate.eventId",
			"CalendarEvent.id",
		)
		.select((eb) => [
			...commonUserSelect(eb),
			"CalendarEvent.name as tournamentName",
			"TournamentTeam.tournamentId",
			"CalendarEventDate.startsAt as tournamentStartTime",
			sql<
				number | null
			>`(SELECT COUNT(*) FROM "TournamentTeamMember" "ttm" WHERE "ttm"."tournamentTeamId" = "TournamentTeam"."id")`.as(
				"teamMemberCount",
			),
			sql<
				number | null
			>`json_extract("Tournament"."settings", '$.minMembersPerTeam')`.as(
				"tournamentMinTeamSize",
			),
		]);
}

/** Ids of pending friend requests the user has received. */
export async function findPendingReceivedRequestIds(
	receiverId: number,
): Promise<number[]> {
	const rows = await db
		.selectFrom("FriendRequest")
		.select("FriendRequest.id")
		.where("FriendRequest.receiverId", "=", receiverId)
		.execute();

	return rows.map((row) => row.id);
}

export async function findFriendIds(userId: number): Promise<number[]> {
	const rows = await db
		.selectFrom("Friendship")
		.select((eb) =>
			eb
				.case()
				.when("Friendship.userOneId", "=", userId)
				.then(eb.ref("Friendship.userTwoId"))
				.else(eb.ref("Friendship.userOneId"))
				.end()
				.as("friendId"),
		)
		.where((eb) =>
			eb.or([
				eb("Friendship.userOneId", "=", userId),
				eb("Friendship.userTwoId", "=", userId),
			]),
		)
		.execute();

	return rows.map((row) => row.friendId);
}
