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
 * Keeps the user's call following `targetRoomId` among related rooms: when the target changes (say the user's
 * team for a lobby's next set) a call in any of `roomIds` moves to it. Joining the target in the first place
 * stays the user's choice, and so does switching between the rooms while the target holds.
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
			roomIds: roomIdsKey.split(",").map(Number),
			targetRoomId,
		});
	}, [targetRoomId, followedRoomId, roomIdsKey]);
}
