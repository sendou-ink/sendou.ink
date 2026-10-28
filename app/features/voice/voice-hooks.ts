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
};
const getServerSnapshot = () => SERVER_SNAPSHOT;

export function useVoiceSnapshot(): VoiceSnapshot {
	return React.useSyncExternalStore(
		voiceClient.subscribe,
		voiceClient.getSnapshot,
		getServerSnapshot,
	);
}

export function useVoiceRoom(room: {
	id: number;
	type: ChatRoomType;
}): VoiceRoomState | null {
	const snapshot = useVoiceSnapshot();
	const hasVoice = VOICE_ROOM_TYPES.some((type) => type === room.type);

	React.useEffect(() => {
		if (!hasVoice) return;
		void voiceClient.loadRoom(room.id);
	}, [hasVoice, room.id]);

	useEventStreamCatchUp({
		enabled: hasVoice,
		onCatchUp: () => void voiceClient.loadRoom(room.id),
	});

	return hasVoice ? (snapshot.roomsById.get(room.id) ?? null) : null;
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
