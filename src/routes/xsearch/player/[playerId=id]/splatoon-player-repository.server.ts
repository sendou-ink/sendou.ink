import { db } from "$lib/server/db/sql";

export function findLinkedUserByPlayerId(playerId: number) {
	return db
		.selectFrom("SplatoonPlayer")
		.innerJoin("User", "SplatoonPlayer.userId", "User.id")
		.select(["User.discordId", "User.customUrl"])
		.where("SplatoonPlayer.id", "=", playerId)
		.executeTakeFirst();
}
