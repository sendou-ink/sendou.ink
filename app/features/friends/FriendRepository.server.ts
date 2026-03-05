import { db } from "~/db/sql";

export async function findByUserIdWithActivity(userId: number) {
	const rows = await db
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
		.execute();

	return rows;
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
