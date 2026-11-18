import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import { databaseTimestampNow } from "~/utils/dates";

export function upsertOwnNote(
	args: Omit<TablesInsertable["PrivateUserNote"], "authorId">,
) {
	const authorId = actorId();
	return db
		.insertInto("PrivateUserNote")
		.values({
			authorId,
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

export function deleteOwnNoteById(targetId: number) {
	return db
		.deleteFrom("PrivateUserNote")
		.where("authorId", "=", actorId())
		.where("targetId", "=", targetId)
		.execute();
}
