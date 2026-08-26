import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as EventBus from "~/features/events/core/EventBus.server";
import { chatRoomChannel, userChannel } from "~/features/events/events-types";
import { parseFormData } from "~/form/parse.server";
import invariant from "~/utils/invariant";
import { badRequestIfFalsy, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import * as ChatRepository from "../ChatRepository.server";
import * as ChatRoomResolver from "../ChatRoomResolver.server";
import { sendChatMessageSchema } from "../chat-schemas";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	requireUser();
	const { id: roomId } = parseParams({ params, schema: idObject });

	await ChatRoomResolver.requireRoom(roomId, "VIEW");

	return { messages: await ChatRepository.findAllMessagesByRoomId(roomId) };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const user = requireUser();
	const { id: roomId } = parseParams({ params, schema: idObject });

	const room = await ChatRoomResolver.requireRoom(roomId, "POST");

	const result = await parseFormData({
		request,
		schema: sendChatMessageSchema,
	});
	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const inserted = await ChatRepository.insertMessage({
		roomId,
		authorUserId: user.id,
		contents: result.data.contents,
		publicId: result.data.publicId,
	});
	// a publicId clash with another room's or user's message is not a retry of
	// this send, and echoing the clashing row would leak it
	badRequestIfFalsy(
		inserted.roomId === roomId && inserted.authorUserId === user.id
			? inserted
			: null,
	);

	// the sender has the room open, so their own message never counts as unread
	// on their other devices
	await ChatRepository.upsertReadIndicator({
		userId: user.id,
		roomId,
		lastSeenMessageId: inserted.id,
	});

	const message = await ChatRepository.findMessageById(inserted.id);
	invariant(message, "inserted chat message not found");

	EventBus.publish(
		[...room.participantUserIds.map(userChannel), chatRoomChannel(roomId)],
		{ kind: "chatMessage", roomId, message },
	);

	return { message };
};
