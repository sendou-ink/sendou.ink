import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";

/** Saves the logged in user's feedback on the post, replacing what they said about it before. */
export async function upsertOwn(
	args: Pick<
		TablesInsertable["FeedFeedback"],
		"itemType" | "itemAt" | "kind" | "comment"
	>,
) {
	const row = await db
		.insertInto("FeedFeedback")
		.values({ ...args, userId: actorId() })
		.onConflict((oc) =>
			oc.columns(["userId", "itemType", "itemAt"]).doUpdateSet({
				kind: args.kind,
				comment: args.comment,
			}),
		)
		.returning("FeedFeedback.id")
		.executeTakeFirstOrThrow();

	return row.id;
}

export async function deleteOwn({
	itemType,
	itemAt,
}: Pick<TablesInsertable["FeedFeedback"], "itemType" | "itemAt">) {
	await db
		.deleteFrom("FeedFeedback")
		.where("FeedFeedback.userId", "=", actorId())
		.where("FeedFeedback.itemType", "=", itemType)
		.where("FeedFeedback.itemAt", "=", itemAt)
		.execute();
}
