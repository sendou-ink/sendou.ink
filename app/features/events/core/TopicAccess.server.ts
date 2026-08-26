import * as ChatRoomResolver from "~/features/chat/ChatRoomResolver.server";
import { SENDOUQ_LOOKING_CHANNEL } from "~/features/sendouq/q-constants";
import { hasPermission } from "~/modules/permissions/utils";
import { CHANNEL_PREFIX } from "../events-types";

const PUBLIC_TOPICS = new Set<string>([SENDOUQ_LOOKING_CHANNEL]);
const PUBLIC_TOPIC_PREFIXES = [
	CHANNEL_PREFIX.tournament,
	CHANNEL_PREFIX.tournamentMatch,
	CHANNEL_PREFIX.sqGroup,
];

/** Whether the user may subscribe their SSE connection to the topic. The `user__` channel is never client-controllable. */
export async function canSubscribe(
	userId: number,
	topic: string,
): Promise<boolean> {
	if (PUBLIC_TOPICS.has(topic)) return true;
	if (PUBLIC_TOPIC_PREFIXES.some((prefix) => topic.startsWith(prefix))) {
		return true;
	}
	if (topic.startsWith(CHANNEL_PREFIX.chatRoom)) {
		const roomId = Number(topic.slice(CHANNEL_PREFIX.chatRoom.length));
		if (!Number.isInteger(roomId) || roomId <= 0) return false;

		const room = await ChatRoomResolver.resolve(roomId);
		if (!room) return false;

		return hasPermission(room, "VIEW", { id: userId });
	}

	return false;
}
