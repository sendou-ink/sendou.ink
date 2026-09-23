import { hasPermission } from "~/modules/permissions/utils";
import { logger } from "~/utils/logger";
import * as ChatRepository from "./ChatRepository.server";
import * as ChatRoomResolver from "./ChatRoomResolver.server";
import { roomListItem } from "./chat-room-list.server";
import type { RouteChatRoom, RouteChatRoomInput } from "./chat-types";

/**
 * Resolves the rooms a route surfaces into what its page arrives with: each room as the sidebar
 * lists it and, for the rooms opening on arrival, their latest messages. A room the user may not
 * view is left out, the loader's own access logic being the one that decides who gets it.
 */
export async function resolve(
	user: { id: number } | undefined,
	inputs: RouteChatRoomInput[],
): Promise<RouteChatRoom[]> {
	if (!user || inputs.length === 0) return [];

	const rooms = await ChatRoomResolver.resolveAll(
		inputs.map((input) => input.roomId),
	);
	const viewableRooms = rooms.filter((room) =>
		hasPermission(room, "VIEW", user),
	);
	const stats = await ChatRepository.findMessageStatsByRoomIds(
		user.id,
		viewableRooms.map((room) => room.roomId),
	);
	const statsByRoomId = new Map(stats.map((row) => [row.roomId, row]));
	const roomsById = new Map(viewableRooms.map((room) => [room.roomId, room]));

	const result: RouteChatRoom[] = [];
	for (const { roomId, ...input } of inputs) {
		const room = roomsById.get(roomId);
		if (!room) {
			logger.warn(`Route surfaced chat room ${roomId} the user can not view`);
			continue;
		}

		result.push({
			...input,
			room: roomListItem(room, statsByRoomId.get(roomId), user),
			messages: input.autoOpen
				? await ChatRepository.findAllMessagesByRoomId(roomId)
				: null,
		});
	}

	return result;
}
