import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import * as ChatRepository from "../ChatRepository.server";
import * as ChatRoomResolver from "../ChatRoomResolver.server";
import { roomListItem } from "../chat-room-list.server";
import type { ChatRoomListItem } from "../chat-types";

/**
 * One room's list item for a viewer the room list does not cover: an observer
 * (TO/streamer/staff) opening a page's room they do not participate in.
 */
export const loader = async ({
	params,
}: LoaderFunctionArgs): Promise<{ room: ChatRoomListItem }> => {
	const user = requireUser();
	const { id: roomId } = parseParams({ params, schema: idObject });

	const room = await ChatRoomResolver.requireRoom(roomId, "VIEW");

	const [stats] = await ChatRepository.findMessageStatsByRoomIds(user.id, [
		roomId,
	]);

	return { room: roomListItem(room, stats, user) };
};
