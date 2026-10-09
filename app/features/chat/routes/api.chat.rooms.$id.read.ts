import * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import { defineAction } from "~/form/define-action.server";
import { id, idObject } from "~/utils/schema";
import * as ChatRepository from "../ChatRepository.server";
import * as ChatRoomResolver from "../ChatRoomResolver.server";

const bodySchema = v.object({ lastSeenMessageId: id });

export const action = defineAction(
	{ params: idObject, body: bodySchema, onInvalidBody: "badRequest" },
	async ({ params: { id: roomId }, body }) => {
		const user = requireUser();

		await ChatRoomResolver.requireRoom(roomId, "VIEW");

		await ChatRepository.upsertReadIndicator({
			userId: user.id,
			roomId,
			lastSeenMessageId: body.lastSeenMessageId,
		});
		await resolveNotifications({
			userIds: [user.id],
			type: "CHAT_MENTION",
			meta: { roomId },
		});

		return null;
	},
);
