import { db } from "~/db/sql";
import { actorId } from "~/features/auth/core/user.server";

/** How many reactions each of the posts has and which of them the user reacted to. */
export async function findByItemIds({
	itemIds,
	userId,
}: {
	itemIds: string[];
	userId: number;
}) {
	if (itemIds.length === 0) {
		return { countByItemId: {}, reactedItemIds: [] as string[] };
	}

	const rows = await db
		.selectFrom("FeedReaction")
		.select(({ fn, eb }) => [
			"FeedReaction.itemId",
			fn.countAll<number>().as("count"),
			fn
				.max(
					eb
						.case()
						.when("FeedReaction.userId", "=", userId)
						.then(1)
						.else(0)
						.end(),
				)
				.as("isOwn"),
		])
		.where("FeedReaction.itemId", "in", itemIds)
		.groupBy("FeedReaction.itemId")
		.execute();

	return {
		countByItemId: Object.fromEntries(
			rows.map((row) => [row.itemId, row.count]),
		),
		reactedItemIds: rows.filter((row) => row.isOwn).map((row) => row.itemId),
	};
}

/** Reacts to the post as the logged in user, or takes the reaction back. */
export async function setOwn({
	itemId,
	isReacted,
}: {
	itemId: string;
	isReacted: boolean;
}) {
	if (!isReacted) {
		await db
			.deleteFrom("FeedReaction")
			.where("FeedReaction.itemId", "=", itemId)
			.where("FeedReaction.userId", "=", actorId())
			.execute();
		return;
	}

	await db
		.insertInto("FeedReaction")
		.values({ itemId, userId: actorId() })
		.onConflict((oc) => oc.columns(["itemId", "userId"]).doNothing())
		.execute();
}
