import type { LoaderFunctionArgs } from "react-router";
import * as NotificationFactory from "~/db/seed/factories/NotificationFactory";
import { requireUser } from "~/features/auth/core/user.server";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { defineAction } from "~/form/define-action.server";
import {
	SAMPLE_NOTIFICATION_TYPES,
	SAMPLE_NOTIFICATIONS,
} from "../dev-tools-constants";
import { sendNotificationSchema } from "../dev-tools-schemas";
import { requireDevTools } from "../dev-tools-utils.server";

export type DevNotificationsLoaderData = ReturnType<typeof loader>;

export const loader = ({ request }: LoaderFunctionArgs) => {
	requireDevTools(request);

	return { types: SAMPLE_NOTIFICATION_TYPES };
};

// in-app only: going around `notify` means no web push can ever leave from here
export const action = defineAction(
	{ body: sendNotificationSchema, onInvalidBody: "badRequest" },
	async ({ request, body }) => {
		requireDevTools(request);
		const user = requireUser();

		const types = body.type === "ALL" ? SAMPLE_NOTIFICATION_TYPES : [body.type];
		for (const type of types) {
			await NotificationFactory.create({
				notification: SAMPLE_NOTIFICATIONS[type],
				users: [{ userId: user.id, seen: 0 }],
			});
		}
		ChatSystemMessage.notifyNotificationsChanged([user.id]);

		return { sentCount: types.length };
	},
);
