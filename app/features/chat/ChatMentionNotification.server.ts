import { notify } from "~/features/notifications/core/notify.server";
import * as NotificationRepository from "~/features/notifications/NotificationRepository.server";
import { hasPermission } from "~/modules/permissions/utils";
import { resolveAvatarUrl } from "~/utils/urls";
import type * as ChatRoomResolver from "./ChatRoomResolver.server";
import { mentionedUserIds } from "./chat-mentions";
import type { ChatMessageWithAuthor } from "./chat-types";

export async function notifyMentioned({
	room,
	message,
}: {
	room: ChatRoomResolver.ResolvedRoom;
	message: ChatMessageWithAuthor;
}) {
	if (!message.contents || !message.author) return;

	const recipientIds = mentionedUserIds(message.contents).filter(
		(userId) =>
			userId !== message.authorUserId &&
			hasPermission(room, "VIEW", { id: userId }),
	);
	const alreadyNotifiedIds =
		await NotificationRepository.findUserIdsWithUnseenByType({
			userIds: recipientIds,
			type: "CHAT_MENTION",
			meta: { roomId: room.roomId },
		});

	await notify({
		userIds: recipientIds.filter(
			(userId) => !alreadyNotifiedIds.includes(userId),
		),
		notification: {
			type: "CHAT_MENTION",
			meta: {
				roomId: room.roomId,
				messageId: message.id,
				mentionerUsername: message.author.username,
				roomUrl: room.url,
			},
			pictureUrl: resolveAvatarUrl({ ...message.author, size: "sm" }),
		},
	});
}
