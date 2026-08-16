import * as R from "remeda";
import { userRoles } from "#lib/modules/permissions/mapper.server.ts";
import { db } from "#lib/server/db/sql.ts";
import { commonUserSelect } from "#lib/server/kysely.ts";

/**
 * The lean user representation used for the authenticated user: common fields
 * plus the columns the app shell and permission checks need.
 */
export async function findLeanById(id: number) {
	const user = await db
		.selectFrom("User")
		.leftJoin("PlusTier", "PlusTier.userId", "User.id")
		.where("User.id", "=", id)
		.select(({ eb }) => [
			...commonUserSelect(eb),
			"User.createdAt",
			"User.customTheme",
			"User.isArtist",
			"User.isVideoAdder",
			"User.isTournamentOrganizer",
			"User.isApiAccesser",
			"User.patronTier",
			"User.languages",
			"User.inGameName",
			"User.preferences",
			"PlusTier.tier as plusTier",
			eb
				.selectFrom("UserFriendCode")
				.select("UserFriendCode.friendCode")
				.where("UserFriendCode.userId", "=", id)
				.orderBy("UserFriendCode.createdAt", "desc")
				.limit(1)
				.as("friendCode"),
		])
		.executeTakeFirst();

	if (!user) return;

	return {
		...R.omit(user, [
			"isArtist",
			"isVideoAdder",
			"isTournamentOrganizer",
			"isApiAccesser",
		]),
		roles: userRoles(user),
	};
}

/** Every user in the plus server with their tier. */
export function findAllPlusServerMembers() {
	return db
		.selectFrom("User")
		.innerJoin("PlusTier", "PlusTier.userId", "User.id")
		.select([
			"User.id as userId",
			"User.discordId",
			"PlusTier.tier as plusTier",
		])
		.execute();
}

/** Users that currently have an active ban, keyed by user id. */
export async function findAllBannedUsers() {
	const rows = await db
		.selectFrom("User")
		.select(["User.id as userId", "User.banned", "User.bannedReason"])
		.where("User.banned", "!=", 0)
		.execute();

	const result: Map<number, (typeof rows)[number]> = new Map();

	for (const row of rows) {
		result.set(row.userId, row);
	}

	return result;
}
