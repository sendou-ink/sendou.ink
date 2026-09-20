import { requireUser } from "~/features/auth/core/user.server";
import { resolveRoomList } from "../chat-room-list.server";
import type { ChatRoomListItem } from "../chat-types";

/** The user's open chat rooms with unread counts, refetched on `chatMessage` / `roomsChanged` events and reconnects; the root loader serves the first snapshot. */
export const loader = async (): Promise<{ rooms: ChatRoomListItem[] }> => {
	const user = requireUser();

	return { rooms: await resolveRoomList(user) };
};
