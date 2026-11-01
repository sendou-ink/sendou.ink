import { requireUser } from "~/features/auth/core/user.server";
import { databaseTimestampNow } from "~/utils/dates";
import * as FeedComments from "../core/FeedComments.server";
import * as FeedItems from "../core/FeedItems.server";
import * as FeedRanking from "../core/FeedRanking";
import {
	FEED_ITEM_TYPES,
	type FeedItemTypeDefinition,
} from "../feed-constants";

export const loader = async () => {
	const user = requireUser();

	const ctx = await FeedItems.contextFor(user.id);
	const items = await FeedItems.buildAll(ctx);

	const definitionOf = (item: FeedItems.FeedItem): FeedItemTypeDefinition =>
		FEED_ITEM_TYPES[item.type];

	return {
		now: ctx.now,
		friendCount: ctx.friendIds.length,
		pinned: items.filter((item) => definitionOf(item).isPinned),
		activity: FeedRanking.rank(
			items.filter(
				(item) => !definitionOf(item).isLive && !definitionOf(item).isPinned,
			),
			ctx.now,
		),
		rotations: await FeedItems.allRotations(),
		rotationsNow: databaseTimestampNow(),
		commentCounts: Object.fromEntries(
			items.map((item) => [
				item.type,
				FeedComments.count({
					type: item.type,
					viewerId: user.id,
					hasFriends: ctx.friendIds.length > 0,
				}),
			]),
		) as Record<string, number>,
	};
};
