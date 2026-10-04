import * as v from "valibot";
import { hidden, textField } from "~/form/fields";
import { SHORT_NANOID_LENGTH } from "~/utils/id";
import { MESSAGE_MAX_LENGTH, MESSAGE_MAX_RAW_LENGTH } from "./chat-constants";
import { visibleLength } from "./chat-mentions";
import { hasValidReplies, messageReply } from "./chat-replies";
import { hasValidStickers, messageSticker } from "./chat-stickers";

export const sendChatMessageSchema = v.object({
	publicId: hidden(v.pipe(v.string(), v.length(SHORT_NANOID_LENGTH))),
	contents: v.pipe(
		textField({
			maxLength: MESSAGE_MAX_RAW_LENGTH,
			placeholder: "placeholders.chatMessage",
			validate: {
				func: (contents) =>
					visibleLength(messageSticker(messageReply(contents).rest).text) <=
					MESSAGE_MAX_LENGTH,
				message: "forms:errors.messageTooLong",
			},
		}),
		v.check(hasValidStickers, "forms:errors.invalidSticker"),
		v.check(hasValidReplies, "forms:errors.invalidReply"),
		v.check(
			(contents) => messageReply(contents).rest.length > 0,
			"forms:errors.required",
		),
	),
});
