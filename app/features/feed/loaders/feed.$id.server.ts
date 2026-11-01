import type { LoaderFunctionArgs } from "react-router";
import { getUser, requireUser } from "~/features/auth/core/user.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import * as FeedComments from "../core/FeedComments.server";
import * as FeedItems from "../core/FeedItems.server";
import * as FeedShare from "../core/FeedShare.server";
import * as FeedReactionRepository from "../FeedReactionRepository.server";
import * as FeedRepository from "../FeedRepository.server";
import { feedItemParamsSchema } from "../feed-schemas";
import { feedSearchParams } from "../feed-search-params";
import { isFeedTester } from "../feed-utils";

const MAX_MOCK_COMMENTERS = 8;

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const user = getUser();
	const { id } = parseParams({ params, schema: feedItemParamsSchema });
	const { viewAs, sharedBy, token } = feedSearchParams.parse(request);

	const isShared =
		sharedBy !== null &&
		token !== null &&
		FeedShare.isValid({ itemId: id, sharerId: sharedBy, token });
	const viewerId = isShared
		? sharedBy
		: viewAs && isFeedTester(user)
			? viewAs
			: requireUser().id;

	const { item, ctx } = notFoundIfNullish(
		await FeedItems.findById({ id, viewerId }),
	);
	const friends =
		ctx.mode === "TEST"
			? await FeedRepository.findCommentAuthorsByIds(
					ctx.friendIds.slice(0, MAX_MOCK_COMMENTERS),
				)
			: [];
	const reactions = await FeedReactionRepository.findByItemIds({
		itemIds: [item.id],
		userId: user?.id ?? 0,
	});

	return {
		mode: ctx.mode,
		now: ctx.now,
		item,
		comments: await FeedComments.forItem({
			item,
			mode: ctx.mode,
			friends,
			now: ctx.now,
		}),
		reactionCount: reactions.countByItemId[item.id] ?? 0,
		isReacted: reactions.reactedItemIds.includes(item.id),
		shareToken: FeedShare.token({ itemId: item.id, sharerId: viewerId }),
		sharedBy: isShared ? sharedBy : null,
		viewAs: !isShared && viewerId !== user?.id ? viewerId : null,
	};
};
