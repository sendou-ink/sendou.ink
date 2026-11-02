import { defineAction } from "~/form/define-action.server";
import { requireRole } from "~/modules/permissions/guards.server";
import { assertUnreachable } from "~/utils/types";
import * as FeedItemIds from "../core/FeedItemIds";
import * as FeedCommentRepository from "../FeedCommentRepository.server";
import * as FeedFeedbackRepository from "../FeedFeedbackRepository.server";
import * as FeedReactionRepository from "../FeedReactionRepository.server";
import { feedItemActionSchema, feedItemParamsSchema } from "../feed-schemas";

export const action = defineAction(
	{ params: feedItemParamsSchema, body: feedItemActionSchema },
	async ({ params, body }) => {
		requireRole("FEED_TESTER");

		const itemType = FeedItemIds.typeOf(params.id)!;

		switch (body._action) {
			case "COMMENT": {
				await FeedCommentRepository.insertOwn({
					itemId: params.id,
					publicId: body.publicId,
					contents: body.contents,
				});
				break;
			}
			case "REACT":
			case "UNREACT": {
				await FeedReactionRepository.setOwn({
					itemId: params.id,
					isReacted: body._action === "REACT",
				});
				break;
			}
			case "FEEDBACK": {
				await FeedFeedbackRepository.upsertOwn({
					itemType,
					itemAt: body.itemAt,
					kind: body.kind,
					comment: body.comment,
				});
				break;
			}
			case "DELETE_FEEDBACK": {
				await FeedFeedbackRepository.deleteOwn({
					itemType,
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
