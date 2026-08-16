import { getUser } from "#lib/features/auth/user.server.ts";
import { query } from "$app/server";
import * as NotificationRepository from "./NotificationRepository.server.ts";
import { NOTIFICATIONS } from "./notifications-constants.ts";

/**
 * The notification peek shown in the bell popover. Same shape as the React
 * app's `GET /api/notifications` resource route.
 */
export const getNotifications = query(async () => {
	const user = getUser();

	return {
		notifications: user
			? await NotificationRepository.findByUserId(user.id, {
					limit: NOTIFICATIONS.PEEK_COUNT,
				})
			: undefined,
	};
});
