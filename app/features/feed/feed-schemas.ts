import * as R from "remeda";
import * as v from "valibot";
import { sendChatMessageSchema } from "~/features/chat/chat-schemas";
import { _action } from "~/utils/schema";
import { FEED_ITEM_TYPES } from "./feed-constants";

export const feedItemParamsSchema = v.object({
	id: v.picklist(R.keys(FEED_ITEM_TYPES)),
});

export const feedItemActionSchema = v.object({
	_action: _action("COMMENT"),
	...sendChatMessageSchema.entries,
});
