import * as React from "react";
import type { ChatRoomType } from "~/features/chat/chat-types";
import { useEventStreamCatchUp } from "~/features/events/events-hooks";
import {
	type VoiceRoomState,
	type VoiceSnapshot,
	voiceClient,
} from "./voice-client";

const SERVER_SNAPSHOT: VoiceSnapshot = {
	roomsById: new Map(),
	call: null,
	volumeByUserId: new Map(),
	pendingFeedback: null,
	inputMode: "OPEN_MIC",
};
const getServerSnapshot = () => SERVER_SNAPSHOT;

export function useVoiceSnapshot(): VoiceSnapshot {
	return React.useSyncExternalStore(
		voiceClient.subscribe,
		voiceClient.getSnapshot,
		getServerSnapshot,
	);
}

export function useVoiceRooms(
	rooms: Array<{
		id: number;
		type: ChatRoomType;
	}>,
): Map<number, VoiceRoomState> {
	const snapshot = useVoiceSnapshot();
	const voiceRoomIds = rooms.map((room) => room.id);
	const voiceRoomIdsKey = voiceRoomIds.join(",");

	React.useEffect(() => {
		if (!voiceRoomIdsKey) return;
		for (const roomId of voiceRoomIdsKey.split(",")) {
			void voiceClient.loadRoom(Number(roomId));
		}
	}, [voiceRoomIdsKey]);

	useEventStreamCatchUp({
		enabled: voiceRoomIds.length > 0,
		onCatchUp: () => {
			for (const roomId of voiceRoomIds) void voiceClient.loadRoom(roomId);
		},
	});

	const roomsById = new Map<number, VoiceRoomState>();
	for (const roomId of voiceRoomIds) {
		const room = snapshot.roomsById.get(roomId);
		if (room) roomsById.set(roomId, room);
	}

	return roomsById;
}

/**
 * Moves the user's call along when `targetRoomId` changes from one room to another, like their team's chat
 * from one set of a lobby to the next. Only a call in the previous target moves, and `null` (e.g. between
 * sets) leaves the call where it is, so joining a room or switching to another stays the user's choice.
 */
export function useVoiceFollow(targetRoomId: number | null) {
	const [followedRoomId, setFollowedRoomId] = React.useState(targetRoomId);

	// syncs the external call with the room the loader says the user belongs in
	React.useEffect(() => {
		if (targetRoomId === null || targetRoomId === followedRoomId) return;
		setFollowedRoomId(targetRoomId);
		if (followedRoomId === null) return;

		void voiceClient.follow({ roomIds: [followedRoomId], targetRoomId });
	}, [targetRoomId, followedRoomId]);
}
