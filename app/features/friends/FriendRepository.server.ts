import { type SelectQueryBuilder, sql } from "kysely";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { COMMON_USER_FIELDS } from "~/utils/kysely.server";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
		.select([
			...COMMON_USER_FIELDS,
			"CalendarEvent.name as tournamentName",
			"TournamentTeam.tournamentId",
			"CalendarEventDate.startTime as tournamentStartTime",
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

export async function findPendingSentRequests(senderId: number) {
	return db
		.selectFrom("FriendRequest")
		.innerJoin("User", "User.id", "FriendRequest.receiverId")
		.select([
			"FriendRequest.id",
			"FriendRequest.createdAt",
			"User.id as receiverId",
			"User.username as receiverUsername",
			"User.discordId as receiverDiscordId",
			"User.discordAvatar as receiverDiscordAvatar",
			"User.customUrl as receiverCustomUrl",
		])
		.where("FriendRequest.senderId", "=", senderId)
		.orderBy("FriendRequest.createdAt", "desc")
		.execute();
}

export async function insertFriendRequest({
	senderId,
	receiverId,
}: {
	senderId: number;
	receiverId: number;
}) {
	await db
		.insertInto("FriendRequest")
		.values({ senderId, receiverId })
		.execute();
}

export async function deleteFriendRequest({
	id,
	senderId,
}: {
	id: number;
	senderId: number;
}) {
	return db
		.deleteFrom("FriendRequest")
		.where("FriendRequest.id", "=", id)
		.where("FriendRequest.senderId", "=", senderId)
		.execute();
}

export async function findFriendRequestBetween({
	senderId,
	receiverId,
}: {
	senderId: number;
	receiverId: number;
}) {
	return db
		.selectFrom("FriendRequest")
		.select("FriendRequest.id")
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

export async function deleteFriendship({
	id,
	userId,
}: {
	id: number;
	userId: number;
}) {
	return db
		.deleteFrom("Friendship")
		.where("Friendship.id", "=", id)
		.where((eb) =>
			eb.or([
				eb("Friendship.userOneId", "=", userId),
				eb("Friendship.userTwoId", "=", userId),
			]),
		)
		.execute();
}

export async function findPendingReceivedRequests(receiverId: number) {
	return db
		.selectFrom("FriendRequest")
		.innerJoin("User", "User.id", "FriendRequest.senderId")
		.select([
			"FriendRequest.id",
			"FriendRequest.createdAt",
			"User.id as senderId",
			"User.username as senderUsername",
			"User.discordId as senderDiscordId",
			"User.discordAvatar as senderDiscordAvatar",
			"User.customUrl as senderCustomUrl",
		])
		.where("FriendRequest.receiverId", "=", receiverId)
		.orderBy("FriendRequest.createdAt", "desc")
		.execute();
}

export async function insertFriendship({
	userOneId,
	userTwoId,
	friendRequestId,
}: {
	userOneId: number;
	userTwoId: number;
	friendRequestId: number;
}) {
	const minId = Math.min(userOneId, userTwoId);
	const maxId = Math.max(userOneId, userTwoId);

	await db.transaction().execute(async (trx) => {
		await trx
			.insertInto("Friendship")
			.values({ userOneId: minId, userTwoId: maxId })
			.execute();

		await trx
			.deleteFrom("FriendRequest")
			.where("FriendRequest.id", "=", friendRequestId)
			.execute();
	});
}

export async function findFriendRequestByIdAndReceiver({
	id,
	receiverId,
}: {
	id: number;
	receiverId: number;
}) {
	return db
		.selectFrom("FriendRequest")
		.select("FriendRequest.senderId")
		.where("FriendRequest.id", "=", id)
		.where("FriendRequest.receiverId", "=", receiverId)
		.executeTakeFirst();
}

export async function deleteFriendRequestByReceiver({
	id,
	receiverId,
}: {
	id: number;
	receiverId: number;
}) {
	return db
		.deleteFrom("FriendRequest")
		.where("FriendRequest.id", "=", id)
		.where("FriendRequest.receiverId", "=", receiverId)
		.execute();
}

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
		.select([
			"User.id",
			"User.username",
			"User.discordId",
			"User.discordAvatar",
			"User.customUrl",
		])
		.execute();
}

export async function countPendingSentRequests(
	senderId: number,
): Promise<number> {
	const result = await db
		.selectFrom("FriendRequest")
		.select((eb) => eb.fn.countAll<number>().as("count"))
		.where("FriendRequest.senderId", "=", senderId)
		.executeTakeFirstOrThrow();

	return result.count;
}

export async function findFriendsByUserId(userId: number) {
	return db
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
		)
		.select([...COMMON_USER_FIELDS])
		.orderBy("User.username", "asc")
		.execute();
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
