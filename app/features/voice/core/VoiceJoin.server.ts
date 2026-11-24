import * as Bans from "~/features/ban/core/Bans.server";
import type { ResolvedRoom } from "~/features/chat/ChatRoomResolver.server";
import * as VoiceRepository from "../VoiceRepository.server";
import * as VoiceAccess from "./VoiceAccess";
import * as VoiceAvailability from "./VoiceAvailability.server";

type JoinBlock = "NO_ACCESS" | "BANNED" | "KICKED" | "UNAVAILABLE";

/**
 * Why the user can't join the room's voice call, `null` if they can. Access
 * blocks (`NO_ACCESS`, `BANNED`, `KICKED`) win over `UNAVAILABLE`.
 */
export async function joinBlock(
	room: ResolvedRoom,
	userId: number,
): Promise<JoinBlock | null> {
	const feature = VoiceAccess.featureOf(room);
	if (!feature || !VoiceAccess.canJoin(room, userId)) return "NO_ACCESS";
	if (Bans.isBanned(userId)) return "BANNED";
	if (await VoiceRepository.hasBeenKicked({ roomId: room.roomId, userId })) {
		return "KICKED";
	}
	if (!(await VoiceAvailability.isAvailable(feature))) return "UNAVAILABLE";

	return null;
}

/**
 * Ids of the rooms the user can join a voice call in, leaving out `joinBlock`'s kick check (a query per room):
 * lets the header show the voice activity in the server render, the client's room load then has the last word.
 */
export async function joinableRoomIds(rooms: ResolvedRoom[], userId: number) {
	const roomIds = new Set<number>();
	if (Bans.isBanned(userId)) return roomIds;

	for (const room of rooms) {
		const feature = VoiceAccess.featureOf(room);
		if (!feature || !VoiceAccess.canJoin(room, userId)) continue;
		if (await VoiceAvailability.isAvailable(feature)) roomIds.add(room.roomId);
	}

	return roomIds;
}
