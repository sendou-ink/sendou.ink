import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { defineAction } from "~/form/define-action.server";
import * as Revalidation from "~/modules/revalidation/revalidation";
import * as NotificationRepository from "../NotificationRepository.server";
import { markAsSeenActionSchema } from "../notifications-schemas";

export const action = defineAction(
	{ body: markAsSeenActionSchema },
	async ({ body }) => {
		const changedUserIds = await NotificationRepository.markOwnAsSeen(
			body.notificationIds,
		);
		// so the unseen dot clears on the user's other open tabs and devices too
		ChatSystemMessage.notifyNotificationsChanged(changedUserIds);

		return Revalidation.none();
	},
);
