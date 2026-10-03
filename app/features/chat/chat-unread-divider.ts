import type { ClientChatMessage, UnreadDivider } from "./chat-types";

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
