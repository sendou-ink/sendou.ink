import * as NotificationRepository from "../NotificationRepository.server";
import type { Notification } from "../notifications-types";

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

	// xxx: await IdkRepository.getPushUrlsForUsers(userIds);

	// send push notifications to users who have enabled them

	// bust cache for affected user ids
}
