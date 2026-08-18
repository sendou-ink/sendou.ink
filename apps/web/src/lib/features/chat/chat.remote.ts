import { error } from "@sveltejs/kit";
import * as R from "remeda";
import * as v from "valibot";
import { getUser, requireUser } from "#lib/features/auth/user.server.ts";
import * as Events from "#lib/server/events.ts";
import { id } from "#lib/utils/schemas.ts";
import { command, getRequestEvent, query } from "$app/server";
import { CHAT } from "./chat-constants.ts";
import { publishChatRoom } from "./chat.server.ts";
import {
	canSendToRoom,
	nextLifecycleChangeAt,
	roomLifecycle,
} from "./chat-utils.ts";
import * as ChatRepository from "./ChatRepository.server.ts";

/**
 * A room's message stream: yields a fresh snapshot (messages, author display
 * info, lifecycle) whenever anything about the room changes. Membership is
 * checked server-side — knowing a room id is not enough to read it.
 */
export const getChatRoom = query.live(
	v.object({ chatRoomId: id }),
	async function* ({ chatRoomId }) {
		const user = requireUser();
		let room = await requireRoomMember(chatRoomId, user);

		yield await roomSnapshot(chatRoomId);

		for await (const _ of Events.subscribe(
			Events.chatRoomChannel(chatRoomId),
			{
				signal: getRequestEvent().request.signal,
				// the room turning inactive/archived is not published by anyone
				wakeAt: () => nextLifecycleChangeAt(room.inactiveAt),
			},
		)) {
			const currentRoom = await ChatRepository.findRoomById(chatRoomId);
			if (!currentRoom) {
				return;
			}
			room = currentRoom;

			yield await roomSnapshot(chatRoomId);
		}
	},
);

async function roomSnapshot(chatRoomId: number) {
	const room = await ChatRepository.findRoomById(chatRoomId);
	if (!room) error(404);

	const messages = await ChatRepository.findMessagesByRoomId(chatRoomId);
	const users = await ChatRepository.findChatUsersByUserIds([
		...new Set(
			messages
				.map((message) => message.userId)
				.filter((userId) => userId !== null),
		),
	]);

	return {
		roomId: chatRoomId,
		messages,
		users,
		lifecycle: roomLifecycle(room.inactiveAt),
	};
}

/** The user's chat rooms with unseen counts, streamed live. */
export const getChatRooms = query.live(async function* () {
	const user = getUser();

	if (!user) {
		yield { rooms: [] };
		return;
	}

	let snapshot = await roomsSnapshot(user.id);
	yield snapshot;

	for await (const _ of Events.subscribe(
		Events.chatRoomsOfUserChannel(user.id),
		{
			signal: getRequestEvent().request.signal,
			// rooms turn inactive, then drop off the list once archived, unpublished
			wakeAt: () => earliestLifecycleChangeAt(snapshot.rooms),
		},
	)) {
		snapshot = await roomsSnapshot(user.id);
		yield snapshot;
	}
});

function earliestLifecycleChangeAt(rooms: { inactiveAt: number | null }[]) {
	const changes = rooms
		.map((room) => nextLifecycleChangeAt(room.inactiveAt))
		.filter((changeAt) => changeAt !== null);

	return R.firstBy(changes, (changeAt) => changeAt.getTime()) ?? null;
}

async function roomsSnapshot(userId: number) {
	const rooms = await ChatRepository.findRoomsOfUser(userId);

	return {
		rooms: rooms.map((room) => ({
			...room,
			unseenCount: room.unseenCount ?? 0,
			lifecycle: roomLifecycle(room.inactiveAt),
		})),
	};
}

export const sendChatMessage = command(
	v.object({
		chatRoomId: id,
		contents: v.pipe(
			v.string(),
			v.trim(),
			v.minLength(1),
			v.maxLength(CHAT.MESSAGE_MAX_LENGTH),
		),
	}),
	async ({ chatRoomId, contents }) => {
		const user = requireUser();
		const room = await requireRoomMember(chatRoomId, user);

		if (!canSendToRoom(roomLifecycle(room.inactiveAt))) {
			error(400, "Room is archived");
		}

		const message = await ChatRepository.insertMessage({
			chatRoomId,
			userId: user.id,
			contents,
		});
		// the sender has obviously seen their own message
		await ChatRepository.upsertRead({
			chatRoomId,
			userId: user.id,
			lastSeenMessageId: message.id,
		});

		await publishChatRoom(chatRoomId);
	},
);

/** Moves the reader's unseen marker up to the given message. */
export const markChatRoomRead = command(
	v.object({ chatRoomId: id, lastSeenMessageId: id }),
	async ({ chatRoomId, lastSeenMessageId }) => {
		const user = requireUser();
		await requireRoomMember(chatRoomId, user);

		await ChatRepository.upsertRead({
			chatRoomId,
			userId: user.id,
			lastSeenMessageId,
		});

		// other tabs of the same user drop their unseen badge too
		Events.publish(Events.chatRoomsOfUserChannel(user.id));
	},
);

async function requireRoomMember(
	chatRoomId: number,
	user: { id: number; roles: string[] },
) {
	const room = await ChatRepository.findRoomById(chatRoomId);
	if (!room) error(404, "Chat room not found");

	const memberIds = await ChatRepository.findRoomMemberIds(chatRoomId);
	if (!memberIds.includes(user.id) && !user.roles.includes("STAFF")) {
		error(403, "Not a member of this chat room");
	}

	return room;
}
