import type { ClientChatMessage, UnreadDivider } from "../chat-types";
import * as Replies from "./Replies";

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
		Replies.split(message.contents ?? "").replyToMessageId === null
	);
}

export function firstUnreadMessageId({
	messages,
	divider,
	ownUserId,
}: {
	messages: ClientChatMessage[];
	divider: UnreadDivider | undefined;
	ownUserId: number;
}): number | null {
	if (!divider) return null;

	const unreadMessages = messages
		.filter(
			(message) =>
				!message.pending &&
				message.id <= divider.upToMessageId &&
				message.authorUserId !== ownUserId,
		)
		.slice(-divider.unreadCount);

	return unreadMessages[0]?.id ?? null;
}
