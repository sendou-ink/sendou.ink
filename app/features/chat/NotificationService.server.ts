import { nanoid } from "nanoid";
import { SKALOP_TOKEN_HEADER_NAME } from "~/constants";
import invariant from "~/utils/invariant";
import type { ChatMessage } from "./chat-types";

// xxx: rename this to ChatNotification or something? Or system message?

type PartialChatMessage = Pick<
	ChatMessage,
	"type" | "context" | "room" | "revalidateOnly"
>;
interface NotificationService {
	notify: (msg: PartialChatMessage | PartialChatMessage[]) => undefined;
}

invariant(
	process.env.SKALOP_SYSTEM_MESSAGE_URL,
	"Missing env var: SKALOP_SYSTEM_MESSAGE_URL",
);
invariant(process.env.SKALOP_TOKEN, "Missing env var: SKALOP_TOKEN");

export const notify: NotificationService["notify"] = (partialMsg) => {
	const msgArr = Array.isArray(partialMsg) ? partialMsg : [partialMsg];

	const fullMessages: ChatMessage[] = msgArr.map((partialMsg) => {
		return {
			id: nanoid(),
			timestamp: Date.now(),
			room: partialMsg.room,
			context: partialMsg.context,
			type: partialMsg.type,
			revalidateOnly: partialMsg.revalidateOnly,
		};
	});

	return void fetch(process.env.SKALOP_SYSTEM_MESSAGE_URL!, {
		method: "POST",
		body: JSON.stringify(fullMessages),
		headers: [[SKALOP_TOKEN_HEADER_NAME, process.env.SKALOP_TOKEN!]],
	}).catch(console.error);
};
