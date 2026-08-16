import { getUser } from "~/features/auth/core/user.server";
import * as NotificationRepository from "../NotificationRepository.server";
import { NOTIFICATIONS } from "../notifications-contants";

/**
 * The notification peek shown in the bell popover. Fetched by
 * `NotificationsProvider` whenever skalop pings that the user's notifications
 * changed, instead of being polled with the rest of the app shell data.
 */
export const loader = async () => {
	const user = getUser();

	return {
		notifications: user
			? await NotificationRepository.findByUserId(user.id, {
					limit: NOTIFICATIONS.PEEK_COUNT,
				})
			: undefined,
	};
};
