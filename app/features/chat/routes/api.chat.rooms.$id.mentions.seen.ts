import { requireUser } from "~/features/auth/core/user.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import { defineAction } from "~/form/define-action.server";
import { idObject } from "~/utils/schema";

export const action = defineAction(
	{ params: idObject },
	async ({ params: { id: roomId } }) => {
		const user = requireUser();

		await resolveNotifications({
			userIds: [user.id],
			type: "CHAT_MENTION",
			meta: { roomId },
		});

		return null;
	},
);
