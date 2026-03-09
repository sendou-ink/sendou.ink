import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";
import { databaseTimestampNow } from "~/utils/dates";

export function byAuthorUserId(
	authorId: number,
	/** Which users to get notes for, if omitted all notes for author are returned */
	targetUserIds: number[] = [],
) {
	let query = db
		.selectFrom("PrivateUserNote")
		.select([
			"PrivateUserNote.sentiment",
			"PrivateUserNote.targetId as targetUserId",
			"PrivateUserNote.text",
			"PrivateUserNote.updatedAt",
		])
		.where("authorId", "=", authorId);

	const targetUsersWithoutAuthor = targetUserIds.filter(
		(id) => id !== authorId,
	);
	if (targetUsersWithoutAuthor.length > 0) {
		query = query.where("targetId", "in", targetUsersWithoutAuthor);
	}

	return query.execute();
}

export function upsert(args: TablesInsertable["PrivateUserNote"]) {
	return db
		.insertInto("PrivateUserNote")
		.values({
			authorId: args.authorId,
			targetId: args.targetId,
			sentiment: args.sentiment,
			text: args.text,
		})
		.onConflict((oc) =>
			oc.columns(["authorId", "targetId"]).doUpdateSet({
				sentiment: args.sentiment,
				text: args.text,
				updatedAt: databaseTimestampNow(),
			}),
		)
		.execute();
}

export function del({
	authorId,
	targetId,
}: {
	authorId: number;
	targetId: number;
}) {
	return db
		.deleteFrom("PrivateUserNote")
		.where("authorId", "=", authorId)
		.where("targetId", "=", targetId)
		.execute();
}
