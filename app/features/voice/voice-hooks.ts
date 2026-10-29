import * as React from "react";
import type { ChatRoomType } from "~/features/chat/chat-types";
import { useEventStreamCatchUp } from "~/features/events/events-hooks";
import {
	type VoiceRoomState,
	type VoiceSnapshot,
	voiceClient,
} from "./voice-client";
import { VOICE_ROOM_TYPES } from "./voice-constants";

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
	const voiceRoomIds = rooms
		.filter((room) => VOICE_ROOM_TYPES.some((type) => type === room.type))
		.map((room) => room.id);
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
 * Keeps the user's call following `targetRoomId` among related rooms: when the target changes (say the user's
 * team for a lobby's next set) a call in any of `roomIds`, or in the previous target, moves to it. Joining the
 * target in the first place stays the user's choice, and so does switching between the rooms while the target holds.
 */
export function useVoiceFollow({
	roomIds,
	targetRoomId,
}: {
	roomIds: number[];
	targetRoomId: number | null;
}) {
	const [followedRoomId, setFollowedRoomId] = React.useState(targetRoomId);
	const roomIdsKey = roomIds.join(",");

	// syncs the external call with the room the loader says the user belongs in
	React.useEffect(() => {
		if (targetRoomId === followedRoomId) return;
		setFollowedRoomId(targetRoomId);
		if (targetRoomId === null) return;

		void voiceClient.follow({
			// the previous target may be gone from `roomIds`, like a lobby's previous set's team chat
			roomIds: [
				...roomIdsKey.split(",").map(Number),
				...(followedRoomId === null ? [] : [followedRoomId]),
			],
			targetRoomId,
		});
	}, [targetRoomId, followedRoomId, roomIdsKey]);
}
