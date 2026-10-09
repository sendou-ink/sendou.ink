import type { ResolvedRoom } from "~/features/chat/ChatRoomResolver.server";
import type { ChatRoomType } from "~/features/chat/chat-types";
import { VOICE_ROOM_TYPES } from "../voice-constants";

type VoiceRoom = Pick<
	ResolvedRoom,
	"type" | "inactive" | "participantUserIds" | "permissions"
>;

export function isVoiceRoomType(type: ChatRoomType) {
	return VOICE_ROOM_TYPES.some((voiceType) => voiceType === type);
}

export function canJoin(room: VoiceRoom, userId: number) {
	if (!isVoiceRoomType(room.type)) return false;
	if (room.inactive) return false;
	if (room.participantUserIds.length < 2) return false;

	return room.permissions.POST.includes(userId);
}

export function canKick(room: VoiceRoom, userId: number) {
	return canJoin(room, userId) && room.permissions.OBSERVE.includes(userId);
}
