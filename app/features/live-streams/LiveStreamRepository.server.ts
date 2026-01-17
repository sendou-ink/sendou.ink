import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";

export function replaceAll(
	streams: Omit<TablesInsertable["LiveStream"], "id">[],
) {
	return db.transaction().execute(async (trx) => {
		await trx.deleteFrom("LiveStream").execute();

		if (streams.length > 0) {
			await trx.insertInto("LiveStream").values(streams).execute();
		}
	});
}

/** @lintignore */
export function findAllWithUserInfo() {
	return db
		.selectFrom("LiveStream")
		.innerJoin("User", "LiveStream.userId", "User.id")
		.select([
			"LiveStream.twitch",
			"LiveStream.viewerCount",
			"LiveStream.thumbnailUrl",
			"User.id as userId",
			"User.username",
			"User.discordId",
			"User.discordAvatar",
			"User.customUrl",
		])
		.orderBy("LiveStream.viewerCount", "desc")
		.execute();
}
