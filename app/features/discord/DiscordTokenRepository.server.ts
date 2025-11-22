import * as R from "remeda";
import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";

export async function findByUserId(userId: number) {
	return db
		.selectFrom("UserDiscordToken")
		.select(["accessToken", "refreshToken", "expiresAt"])
		.where("UserDiscordToken.userId", "=", userId)
		.executeTakeFirst();
}

export async function findByDiscordId(discordId: string) {
	return db
		.selectFrom("UserDiscordToken")
		.innerJoin("User", "User.id", "UserDiscordToken.userId")
		.select(["accessToken", "refreshToken", "expiresAt"])
		.where("User.discordId", "=", discordId)
		.executeTakeFirst();
}

export async function upsert(
	args: Omit<TablesInsertable["UserDiscordToken"], "userId"> & {
		discordId: string;
	},
) {
	const user = await db
		.selectFrom("User")
		.select("id")
		.where("discordId", "=", args.discordId)
		.executeTakeFirstOrThrow();

	return db
		.insertInto("UserDiscordToken")
		.values({ ...R.omit(args, ["discordId"]), userId: user.id })
		.onConflict((oc) =>
			oc.column("userId").doUpdateSet({
				accessToken: args.accessToken,
				refreshToken: args.refreshToken,
				expiresAt: args.expiresAt,
			}),
		)
		.returningAll()
		.executeTakeFirstOrThrow();
}
