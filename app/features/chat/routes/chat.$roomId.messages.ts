import type { ActionFunctionArgs } from "react-router";
import * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import * as EventBus from "~/features/events/core/EventBus.server";
import { parseFormData } from "~/form/parse.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import invariant from "~/utils/invariant";
import {
	badRequestIfFalsy,
	notFoundIfNullish,
	parseParams,
} from "~/utils/remix.server";
import { id } from "~/utils/schema";
import * as ChatRepository from "../ChatRepository.server";
import * as ChatRoomResolver from "../ChatRoomResolver.server";
import { sendChatMessageSchema } from "../chat-schemas";

const paramsSchema = v.object({ roomId: id });

export const action = async ({ request, params }: ActionFunctionArgs) => {
	const user = requireUser();
	const { roomId } = parseParams({ params, schema: paramsSchema });

	const room = notFoundIfNullish((await ChatRoomResolver.resolve([roomId]))[0]);
	requirePermission(room, "POST");

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
		[
			...room.participantUserIds.map(EventBus.userChannel),
			EventBus.chatRoomChannel(roomId),
		],
		{ kind: "chatMessage", roomId, message },
	);

	return { message };
};
