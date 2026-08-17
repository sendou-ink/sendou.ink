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

/**
 * The pending friend request between the two users regardless of direction, or `undefined` when
 * there is none.
 */
export async function findFriendRequestBetween({
	senderId,
	receiverId,
}: {
	senderId: number;
	receiverId: number;
}) {
	return db
		.selectFrom("FriendRequest")
		.select(["FriendRequest.id", "FriendRequest.senderId"])
		.where((eb) =>
			eb.or([
				eb.and([
					eb("FriendRequest.senderId", "=", senderId),
					eb("FriendRequest.receiverId", "=", receiverId),
				]),
				eb.and([
					eb("FriendRequest.senderId", "=", receiverId),
					eb("FriendRequest.receiverId", "=", senderId),
				]),
			]),
		)
		.executeTakeFirst();
}

/** Users who are friends with both given users. */
export async function findMutualFriends({
	loggedInUserId,
	targetUserId,
}: {
	loggedInUserId: number;
	targetUserId: number;
}) {
	return db
		.selectFrom("Friendship as f1")
		.innerJoin("Friendship as f2", (join) =>
			join.on((eb) =>
				eb.and([
					eb(
						eb
							.case()
							.when("f1.userOneId", "=", loggedInUserId)
							.then(eb.ref("f1.userTwoId"))
							.else(eb.ref("f1.userOneId"))
							.end(),
						"=",
						eb
							.case()
							.when("f2.userOneId", "=", targetUserId)
							.then(eb.ref("f2.userTwoId"))
							.else(eb.ref("f2.userOneId"))
							.end(),
					),
				]),
			),
		)
		.innerJoin("User", (join) =>
			join.on((eb) =>
				eb(
					"User.id",
					"=",
					eb
						.case()
						.when("f1.userOneId", "=", loggedInUserId)
						.then(eb.ref("f1.userTwoId"))
						.else(eb.ref("f1.userOneId"))
						.end(),
				),
			),
		)
		.where((eb) =>
			eb.or([
				eb("f1.userOneId", "=", loggedInUserId),
				eb("f1.userTwoId", "=", loggedInUserId),
			]),
		)
		.where((eb) =>
			eb.or([
				eb("f2.userOneId", "=", targetUserId),
				eb("f2.userTwoId", "=", targetUserId),
			]),
		)
		.select((eb) => commonUserSelect(eb))
		.execute();
}

/** The friendship row between the two users, or `undefined` when they are not friends. */
export async function findFriendship({
	userOneId,
	userTwoId,
}: {
	userOneId: number;
	userTwoId: number;
}) {
	const minId = Math.min(userOneId, userTwoId);
	const maxId = Math.max(userOneId, userTwoId);

	return db
		.selectFrom("Friendship")
		.select("Friendship.id")
		.where("Friendship.userOneId", "=", minId)
		.where("Friendship.userTwoId", "=", maxId)
		.executeTakeFirst();
}
