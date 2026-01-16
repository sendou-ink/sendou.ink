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
			"User.id",
			"User.username",
			"User.discordId",
			"User.discordAvatar",
			"User.customUrl",
			"CalendarEvent.name as tournamentName",
			"TournamentSub.tournamentId",
			"CalendarEventDate.startTime as tournamentStartTime",
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
