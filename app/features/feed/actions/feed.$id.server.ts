import { requireUser } from "~/features/auth/core/user.server";
import { defineAction } from "~/form/define-action.server";
import { databaseTimestampNow } from "~/utils/dates";
import * as FeedComments from "../core/FeedComments.server";
import * as FeedRepository from "../FeedRepository.server";
import { feedItemActionSchema, feedItemParamsSchema } from "../feed-schemas";

export const action = defineAction(
	{ params: feedItemParamsSchema, body: feedItemActionSchema },
	async ({ params, body }) => {
		const user = requireUser();
		const [author] = await FeedRepository.findCommentAuthorsByIds([user.id]);

		FeedComments.add({
			type: params.id,
			viewerId: user.id,
			author,
			publicId: body.publicId,
			contents: body.contents,
			now: databaseTimestampNow(),
		});

		return null;
	},
);
