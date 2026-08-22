const PUBLIC_TOPICS = new Set(["sq-looking"]);
const PUBLIC_TOPIC_PREFIXES = ["tournament__", "match__", "sq-group__"];
const CHAT_ROOM_TOPIC_PREFIX = "chat-room__";

/** Whether the user may subscribe their SSE connection to the topic. The `user__` channel is never client-controllable. */
export function canSubscribe(_userId: number, topic: string): boolean {
	if (PUBLIC_TOPICS.has(topic)) return true;
	if (PUBLIC_TOPIC_PREFIXES.some((prefix) => topic.startsWith(prefix))) {
		return true;
	}
	if (topic.startsWith(CHAT_ROOM_TOPIC_PREFIX)) {
		// TODO: observer check via ChatRoomResolver once owner wiring lands
		return false;
	}

	return false;
}
