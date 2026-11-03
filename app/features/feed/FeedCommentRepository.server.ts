import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import type { ChatMessageWithAuthor } from "~/features/chat/chat-types";
import { commonUserSelect, userChatNameHue } from "~/utils/kysely.server";

/** The comments of the post as chat messages, oldest first. */
export async function findByItemId(
	itemId: string,
): Promise<ChatMessageWithAuthor[]> {
	const rows = await db
		.selectFrom("FeedComment")
		.innerJoin("User", "User.id", "FeedComment.authorId")
		.select((eb) => [
			"FeedComment.id",
			"FeedComment.publicId",
			"FeedComment.contents",
			"FeedComment.createdAt",
			...commonUserSelect(eb, { idAs: "authorId" }),
			"User.pronouns",
			userChatNameHue,
		])
		.where("FeedComment.itemId", "=", itemId)
		.orderBy("FeedComment.createdAt", "asc")
		.orderBy("FeedComment.id", "asc")
		.execute();

	return rows.map((row) => ({
		id: row.id,
		roomId: 0,
		authorUserId: row.authorId,
		type: null,
		contents: row.contents,
		publicId: row.publicId,
		createdAt: row.createdAt,
		author: {
			id: row.authorId,
			username: row.username,
			customUrl: row.customUrl,
			avatar: row.avatar,
			pronouns: row.pronouns,
			chatNameHue: row.chatNameHue,
		},
	}));
}

/** How many comments each of the posts has, posts without any left out. */
export async function countByItemIds(
	itemIds: string[],
): Promise<Record<string, number>> {
	if (itemIds.length === 0) return {};

	const rows = await db
		.selectFrom("FeedComment")
		.select(({ fn }) => [
			"FeedComment.itemId",
			fn.countAll<number>().as("count"),
		])
		.where("FeedComment.itemId", "in", itemIds)
		.groupBy("FeedComment.itemId")
		.execute();

	return Object.fromEntries(rows.map((row) => [row.itemId, row.count]));
}

/** Adds a comment to the post, `authorId` filled from the logged in user. A resend with the same `publicId` is ignored. */
export async function insert(
	args: Pick<
		TablesInsertable["FeedComment"],
		"itemId" | "publicId" | "contents"
	>,
) {
	await db
		.insertInto("FeedComment")
		.values({ ...args, authorId: actorId() })
		.onConflict((oc) => oc.column("publicId").doNothing())
		.execute();
}
