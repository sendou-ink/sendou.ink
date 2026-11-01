import { requireUser } from "~/features/auth/core/user.server";
import { defineAction } from "~/form/define-action.server";
import { databaseTimestampNow } from "~/utils/dates";
import { assertUnreachable } from "~/utils/types";
import * as FeedComments from "../core/FeedComments.server";
import * as FeedFeedbackRepository from "../FeedFeedbackRepository.server";
import * as FeedRepository from "../FeedRepository.server";
import { feedItemActionSchema, feedItemParamsSchema } from "../feed-schemas";

export const action = defineAction(
	{ params: feedItemParamsSchema, body: feedItemActionSchema },
	async ({ params, body }) => {
		const user = requireUser();

		switch (body._action) {
			case "COMMENT": {
				const [author] = await FeedRepository.findCommentAuthorsByIds([
					user.id,
				]);

				FeedComments.add({
					type: params.id,
					viewerId: user.id,
					author,
					publicId: body.publicId,
					contents: body.contents,
					now: databaseTimestampNow(),
				});
				break;
			}
			case "FEEDBACK": {
				await FeedFeedbackRepository.upsertOwn({
					itemType: params.id,
					itemAt: body.itemAt,
					kind: body.kind,
					comment: body.comment,
				});
				break;
			}
			case "DELETE_FEEDBACK": {
				await FeedFeedbackRepository.deleteOwn({
					itemType: params.id,
					itemAt: body.itemAt,
				});
				break;
			}
			default: {
				assertUnreachable(body);
			}
		}

		return null;
	},
);
