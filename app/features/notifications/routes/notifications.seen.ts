import type { ActionFunctionArgs } from "react-router";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { parseRequestPayload } from "~/utils/remix.server";
import * as NotificationRepository from "../NotificationRepository.server";
import { markAsSeenActionSchema } from "../notifications-schemas";

export const action = async ({ request }: ActionFunctionArgs) => {
	const data = await parseRequestPayload({
		request,
		schema: markAsSeenActionSchema,
	});

	const changedUserIds = await NotificationRepository.markOwnAsSeen(
		data.notificationIds,
	);
	// so the unseen dot clears on the user's other open tabs and devices too
	ChatSystemMessage.notifyNotificationsChanged(changedUserIds);

	return null;
};
