import { messageReply } from "./chat-replies";
import type { ClientChatMessage } from "./chat-types";

const MESSAGE_BATCH_INTERVAL_SECONDS = 3 * 60;

export function continuesBatch(
	previous: ClientChatMessage | undefined,
	message: ClientChatMessage,
) {
	if (!previous) return false;

	return (
		previous.type === null &&
		message.type === null &&
		message.authorUserId !== null &&
		message.authorUserId === previous.authorUserId &&
		message.createdAt - previous.createdAt <= MESSAGE_BATCH_INTERVAL_SECONDS &&
		messageReply(message.contents ?? "").replyToMessageId === null
	);
}
