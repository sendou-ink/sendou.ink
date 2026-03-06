import { db } from "~/db/sql";

export async function findByUserIdWithActivity(userId: number) {
	const [friendRows, teamMemberRows] = await Promise.all([
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
			.leftJoin("TournamentSub", "TournamentSub.userId", "User.id")
			.leftJoin(
				"CalendarEvent",
				"CalendarEvent.tournamentId",
				"TournamentSub.tournamentId",
			)
			.leftJoin(
				"CalendarEventDate",
				"CalendarEventDate.eventId",
				"CalendarEvent.id",
			)
			.select([
				"Friendship.id as friendshipId",
				"User.id",
				"User.username",
				"User.discordId",
				"User.discordAvatar",
				"User.customUrl",
				"CalendarEvent.name as tournamentName",
				"TournamentSub.tournamentId",
				"CalendarEventDate.startTime as tournamentStartTime",
				"Friendship.createdAt as friendshipCreatedAt",
			])
			.where((eb) =>
				eb.or([
					eb("Friendship.userOneId", "=", userId),
					eb("Friendship.userTwoId", "=", userId),
				]),
			)
			.orderBy("Friendship.createdAt", "desc")
			.execute(),
		db
			.selectFrom("TeamMemberWithSecondary as myMembership")
			.innerJoin("TeamMemberWithSecondary as otherMembership", (join) =>
				join
					.onRef("otherMembership.teamId", "=", "myMembership.teamId")
					.on("otherMembership.userId", "!=", userId),
			)
			.innerJoin("User", "User.id", "otherMembership.userId")
			.leftJoin("TournamentSub", "TournamentSub.userId", "User.id")
			.leftJoin(
				"CalendarEvent",
				"CalendarEvent.tournamentId",
				"TournamentSub.tournamentId",
			)
			.leftJoin(
				"CalendarEventDate",
				"CalendarEventDate.eventId",
				"CalendarEvent.id",
			)
			.select([
				"User.id",
				"User.username",
				"User.discordId",
				"User.discordAvatar",
				"User.customUrl",
				"CalendarEvent.name as tournamentName",
				"TournamentSub.tournamentId",
				"CalendarEventDate.startTime as tournamentStartTime",
			])
			.where("myMembership.userId", "=", userId)
			.where("myMembership.leftAt", "is", null)
			.where("otherMembership.leftAt", "is", null)
			.execute(),
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
