import * as ChatRoomResolver from "~/features/chat/ChatRoomResolver.server";

const PUBLIC_TOPICS = new Set(["sq-looking"]);
const PUBLIC_TOPIC_PREFIXES = ["tournament__", "match__", "sq-group__"];
const CHAT_ROOM_TOPIC_PREFIX = "chat-room__";

/** Whether the user may subscribe their SSE connection to the topic. The `user__` channel is never client-controllable. */
export async function canSubscribe(
	userId: number,
	topic: string,
): Promise<boolean> {
	if (PUBLIC_TOPICS.has(topic)) return true;
	if (PUBLIC_TOPIC_PREFIXES.some((prefix) => topic.startsWith(prefix))) {
		return true;
	}
	if (topic.startsWith(CHAT_ROOM_TOPIC_PREFIX)) {
		const roomId = Number(topic.slice(CHAT_ROOM_TOPIC_PREFIX.length));
		if (!Number.isInteger(roomId) || roomId <= 0) return false;

		const [room] = await ChatRoomResolver.resolve([roomId]);
		if (!room) return false;

		return ChatRoomResolver.canView(room, userId);
	}

	return false;
}
