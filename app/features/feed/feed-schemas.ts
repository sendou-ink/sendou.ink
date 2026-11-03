import * as v from "valibot";
import { sendChatMessageSchema } from "~/features/chat/chat-schemas";
import {
	_action,
	coerceNumber,
	safeNullableStringSchema,
} from "~/utils/schema";
import * as FeedItemIds from "./core/FeedItemIds";
import {
	FEED_FEEDBACK_COMMENT_MAX_LENGTH,
	FEED_FEEDBACK_KINDS,
} from "./feed-constants";

export const feedItemParamsSchema = v.object({
	id: v.pipe(
		v.string(),
		v.maxLength(100),
		v.check((id) => FeedItemIds.typeOf(id) !== null),
	),
});

const itemAt = v.pipe(coerceNumber(), v.integer());

export const feedItemActionSchema = v.union([
	v.object({
		_action: _action("COMMENT"),
		...sendChatMessageSchema.entries,
	}),
	v.object({
		_action: _action("FEEDBACK"),
		itemAt,
		kind: v.picklist(FEED_FEEDBACK_KINDS),
		comment: v.optional(
			safeNullableStringSchema({ max: FEED_FEEDBACK_COMMENT_MAX_LENGTH }),
			null,
		),
	}),
	v.object({
		_action: _action("DELETE_FEEDBACK"),
		itemAt,
	}),
	v.object({
		_action: _action("REACT"),
	}),
	v.object({
		_action: _action("UNREACT"),
	}),
]);
