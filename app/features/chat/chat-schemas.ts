import * as v from "valibot";
import { hidden, textField } from "~/form/fields";
import { SHORT_NANOID_LENGTH } from "~/utils/id";
import { MESSAGE_MAX_LENGTH, MESSAGE_MAX_RAW_LENGTH } from "./chat-constants";
import * as Mentions from "./core/Mentions";
import * as Replies from "./core/Replies";
import * as Stickers from "./core/Stickers";

export const sendChatMessageSchema = v.object({
	publicId: hidden(v.pipe(v.string(), v.length(SHORT_NANOID_LENGTH))),
	contents: v.pipe(
		textField({
			maxLength: MESSAGE_MAX_RAW_LENGTH,
			placeholder: "placeholders.chatMessage",
			validate: {
				func: (contents) =>
					Mentions.visibleLength(
						Stickers.split(Replies.split(contents).rest).text,
					) <= MESSAGE_MAX_LENGTH,
				message: "forms:errors.messageTooLong",
			},
		}),
		v.check(Stickers.hasValid, "forms:errors.invalidSticker"),
		v.check(Replies.hasValid, "forms:errors.invalidReply"),
		v.check(
			(contents) => Replies.split(contents).rest.length > 0,
			"forms:errors.required",
		),
	),
});
