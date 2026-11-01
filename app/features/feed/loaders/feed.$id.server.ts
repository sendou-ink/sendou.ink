import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import * as FeedComments from "../core/FeedComments.server";
import * as FeedItems from "../core/FeedItems.server";
import * as FeedRepository from "../FeedRepository.server";
import { feedItemParamsSchema } from "../feed-schemas";

const MAX_MOCK_COMMENTERS = 8;

export const loader = async (args: LoaderFunctionArgs) => {
	const user = requireUser();
	const { id: type } = parseParams({
		params: args.params,
		schema: feedItemParamsSchema,
	});

	const ctx = await FeedItems.contextFor(user.id);
	const item = notFoundIfNullish(await FeedItems.buildOne(type, ctx));
	const friends = await FeedRepository.findCommentAuthorsByIds(
		ctx.friendIds.slice(0, MAX_MOCK_COMMENTERS),
	);

	return {
		now: ctx.now,
		item,
		comments: FeedComments.forItem({
			item,
			viewerId: user.id,
			friends,
			now: ctx.now,
		}),
	};
};
