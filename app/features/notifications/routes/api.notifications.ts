import { getUser } from "~/features/auth/core/user.server";
import * as NotificationRepository from "../NotificationRepository.server";
import { NOTIFICATIONS } from "../notifications-contants";

/** The bell popover's notification peek, fetched by `NotificationsProvider` whenever an event says the user's notifications changed. */
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
