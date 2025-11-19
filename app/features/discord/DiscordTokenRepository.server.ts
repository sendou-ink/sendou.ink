import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";

export async function findByUserId(userId: number) {
	return db
		.selectFrom("UserDiscordToken")
		.select(["accessToken", "refreshToken", "expiresAt"])
		.where("userId", "=", userId)
		.executeTakeFirst();
}

export async function upsert(
	args: TablesInsertable["UserDiscordToken"],
): Promise<void> {
	await db
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
