import { databaseTimestampNow } from "~/utils/dates";
import { notFoundIfNullish } from "~/utils/remix.server";
import * as FeedReactionRepository from "../FeedReactionRepository.server";
import * as FeedRepository from "../FeedRepository.server";
import {
	FEED_ITEM_TYPES,
	type FeedItemTypeDefinition,
} from "../feed-constants";
import * as FeedComments from "./FeedComments.server";
import * as FeedItems from "./FeedItems.server";
import * as FeedRanking from "./FeedRanking";
import * as FeedShare from "./FeedShare.server";

export type FeedPageData = Awaited<ReturnType<typeof load>>;

/** Everything a feed page shows: the viewer's posts in order with their comment and reaction counts as `userId` sees them. */
export async function load({
	viewerId,
	userId,
	mode,
	isScoreShown,
}: {
	viewerId: number;
	/** The logged in user, differs from `viewerId` when a dev views someone else's feed */
	userId: number;
	mode: FeedItems.FeedMode;
	/** Whether each post's ranking score breakdown is included */
	isScoreShown: boolean;
}) {
	const ctx = await FeedItems.contextFor({ viewerId, mode });
	const items = (await FeedItems.buildAll(ctx)).filter(
		(item) => mode === "TEST" || !FeedRanking.isStale(item, ctx.now),
	);
	const viewer = notFoundIfNullish(
		(await FeedRepository.findUsersByIds([viewerId])).at(0),
	);
	const commentCounts = await FeedComments.countByItem({
		items,
		mode,
		hasFriends: ctx.friendIds.length > 0,
	});
	const reactions = await FeedReactionRepository.findByItemIds({
		itemIds: items.map((item) => item.id),
		userId,
	});

	return {
		mode,
		now: ctx.now,
		viewer,
		friendCount: ctx.friendIds.length,
		pinned: items.filter((item) => definitionOf(item).isPinned),
		activity: FeedRanking.rank(
			items.filter((item) => !definitionOf(item).isPinned),
			ctx.now,
			ctx.weaponPool,
		).map((item) => ({ ...item, score: isScoreShown ? item.score : null })),
		rotations: await FeedItems.allRotations(),
		rotationsNow: databaseTimestampNow(),
		interactions: Object.fromEntries(
			items.map((item) => [
				item.id,
				{
					commentCount: commentCounts[item.id] ?? 0,
					reactionCount: reactions.countByItemId[item.id] ?? 0,
					isReacted: reactions.reactedItemIds.includes(item.id),
					shareToken: FeedShare.token({ itemId: item.id, sharerId: viewerId }),
				},
			]),
		) as Record<string, FeedItemInteractions>,
	};
}

export interface FeedItemInteractions {
	commentCount: number;
	reactionCount: number;
	isReacted: boolean;
	shareToken: string;
}

function definitionOf(item: FeedItems.FeedItem): FeedItemTypeDefinition {
	return FEED_ITEM_TYPES[item.type];
}
