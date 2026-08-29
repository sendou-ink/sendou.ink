import * as v from "valibot";
import { hidden, textField } from "~/form/fields";
import { SHORT_NANOID_LENGTH } from "~/utils/id";
import { MESSAGE_MAX_LENGTH } from "./chat-constants";

export const sendChatMessageSchema = v.object({
	publicId: hidden(v.pipe(v.string(), v.length(SHORT_NANOID_LENGTH))),
	contents: textField({
		maxLength: MESSAGE_MAX_LENGTH,
		placeholder: "placeholders.chatMessage",
	}),
});
