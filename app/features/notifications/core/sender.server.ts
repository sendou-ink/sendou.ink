import * as NotificationRepository from "../NotificationRepository.server";
import type { Notification } from "../notifications-types";

export async function notify({
	userIds,
	notification,
}: {
	userIds: Array<number>;
	notification: Notification;
}) {
	await NotificationRepository.insertMany(
		userIds.map((userId) => ({
			userId,
			value: JSON.stringify(notification),
		})),
	);

	// xxx: await IdkRepository.getPushUrlsForUsers(userIds);

	// send push notifications to users who have enabled them

	// bust cache for affected user ids
}
