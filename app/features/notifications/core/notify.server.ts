import * as NotificationRepository from "../NotificationRepository.server";
import type { Notification } from "../notifications-types";
import webPush from "./webPush.server";

// xxx: deduplicate notifications if someone e.g. spams invites to team (need key)

/**
 * Create notifications both in the database and send push notifications to users (if enabled).
 */
export async function notify({
	userIds,
	notification,
	defaultSeenUserIds,
}: {
	/** Array of user ids to notify */
	userIds: Array<number>;
	/** Array of user ids that should have the notification marked as seen by default */
	defaultSeenUserIds?: Array<number>;
	/** Notification to send (same for all users) */
	notification: Notification;
}) {
	if (userIds.length === 0) {
		return;
	}

	try {
		await NotificationRepository.insert(
			notification,
			userIds.map((userId) => ({
				userId,
				seen: defaultSeenUserIds?.includes(userId) ? 1 : 0,
			})),
		);
	} catch (e) {
		console.error("Failed to notify users", e);
	}

	for (const subscription of await NotificationRepository.subscriptionsByUserIds(
		userIds,
	)) {
		// xxx: send proper payload with msg text, icon & link (that opens correctly)
		await webPush.sendNotification(subscription, JSON.stringify(notification));

		// xxx: delete if not found or gone
	}

	// bust cache for affected user ids
}
