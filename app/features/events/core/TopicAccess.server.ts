import * as R from "remeda";
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

/** Whether the user may subscribe their SSE connection to every one of the topics. The `user__` channel is never client-controllable. */
export async function canSubscribeToAll(
	userId: number,
	topics: string[],
): Promise<boolean> {
	const roomIds: number[] = [];

	for (const topic of topics) {
		if (isPublicTopic(topic)) continue;

		const roomId = chatRoomTopicToRoomId(topic);
		if (roomId === null) return false;

		roomIds.push(roomId);
	}

	if (roomIds.length === 0) return true;

	const rooms = await ChatRoomResolver.resolveAll(R.unique(roomIds));
	const roomById = new Map(rooms.map((room) => [room.roomId, room]));

	return roomIds.every((roomId) => {
		const room = roomById.get(roomId);

		return room ? hasPermission(room, "VIEW", { id: userId }) : false;
	});
}

function isPublicTopic(topic: string) {
	return (
		PUBLIC_TOPICS.has(topic) ||
		PUBLIC_TOPIC_PREFIXES.some((prefix) => topic.startsWith(prefix))
	);
}

/** Room id of a `chatRoom__` topic, null for any other or malformed topic. */
function chatRoomTopicToRoomId(topic: string) {
	if (!topic.startsWith(CHANNEL_PREFIX.chatRoom)) return null;

	const roomId = Number(topic.slice(CHANNEL_PREFIX.chatRoom.length));
	if (!Number.isInteger(roomId) || roomId <= 0) return null;

	return roomId;
}
