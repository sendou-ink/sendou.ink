import type { ResolvedRoom } from "~/features/chat/ChatRoomResolver.server";
import { databaseTimestampNow } from "~/utils/dates";
import type { VoiceFeature } from "../voice-constants";

type VoiceRoom = Pick<
	ResolvedRoom,
	| "type"
	| "isLookingForMembers"
	| "inactive"
	| "participantUserIds"
	| "permissions"
	| "closedAt"
	| "expiresAt"
>;

export function featureOf(
	room: Pick<ResolvedRoom, "type" | "isLookingForMembers">,
): VoiceFeature | null {
	switch (room.type) {
		case "SQ_GROUP":
		case "SQ_MATCH":
			return "SENDOUQ";
		case "LOBBY":
		case "LOBBY_TEAM":
			return "LOBBIES";
		case "TOURNAMENT_MATCH":
			return "TOURNAMENTS";
		case "TOURNAMENT_TEAM":
			return room.isLookingForMembers ? "LFG" : "TOURNAMENTS";
		case "SCRIM":
			return null;
	}
}

export function canJoin(room: VoiceRoom, userId: number) {
	if (!featureOf(room)) return false;
	if (room.inactive) return false;
	if (room.participantUserIds.length < 2) return false;
	if (room.permissions.POST.includes(userId)) return true;

	return (
		room.permissions.OBSERVE.includes(userId) &&
		room.closedAt === null &&
		room.expiresAt > databaseTimestampNow()
	);
}

export function canKick(room: VoiceRoom, userId: number) {
	return canJoin(room, userId) && room.permissions.OBSERVE.includes(userId);
}
