import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";

/** The user's stored Discord linked role tokens, `undefined` if they have not linked. */
export function findByUserId(userId: number) {
	return db
		.selectFrom("UserDiscordToken")
		.select(["accessToken", "refreshToken", "expiresAt"])
		.where("UserDiscordToken.userId", "=", userId)
		.executeTakeFirst();
}

/** Ids of every user who has linked sendou.ink as a Discord linked role. */
export async function findAllUserIds() {
	const rows = await db
		.selectFrom("UserDiscordToken")
		.select("userId")
		.execute();

	return rows.map((row) => row.userId);
}

/** Stores the user's tokens, replacing the ones they had before. */
export function upsert(args: TablesInsertable["UserDiscordToken"]) {
	return db
		.insertInto("UserDiscordToken")
		.values(args)
		.onConflict((oc) =>
			oc.column("userId").doUpdateSet({
				accessToken: args.accessToken,
				refreshToken: args.refreshToken,
				expiresAt: args.expiresAt,
			}),
		)
		.execute();
}

/**
 * Deletes the user's tokens if the access token is still the given one. A token refreshed
 * concurrently in the meantime is kept.
 */
export function deleteIfUnchanged(args: {
	userId: number;
	accessToken: string;
}) {
	return db
		.deleteFrom("UserDiscordToken")
		.where("userId", "=", args.userId)
		.where("accessToken", "=", args.accessToken)
		.execute();
}
