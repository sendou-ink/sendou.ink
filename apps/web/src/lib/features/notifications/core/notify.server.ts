import { logger } from "@sendou/utils/logger";
import * as Events from "#lib/server/events.ts";
import { IS_E2E_TEST_RUN } from "#lib/utils/e2e.ts";
import * as NotificationRepository from "../NotificationRepository.server.ts";
import type { Notification } from "../notifications-types.ts";
import { notificationMeta } from "../notifications-utils.ts";

const SENT_NOTIFICATION_TTL_MS = 1000 * 60 * 60;

/**
 * Creates notifications in the database and wakes the recipients' live
 * notification streams.
 *
 * xxx: web push (grace-period delivery to unseen recipients) not ported yet —
 * lands with the notifications feature migration.
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

	const dededuplicatedUserIds = Array.from(new Set(userIds));

	if (isNotificationAlreadySent(notification, dededuplicatedUserIds)) {
		return;
	}

	try {
		await NotificationRepository.insert(
			notification,
			dededuplicatedUserIds.map((userId) => ({
				userId,
				seen: defaultSeenUserIds?.includes(userId) ? 1 : 0,
			})),
		);
		notifyNotificationsChanged(dededuplicatedUserIds);
	} catch (e) {
		logger.error("Failed to notify users", e);
	}
}

/** Wakes the users' live notification streams (bell dot & peek list). */
export function notifyNotificationsChanged(userIds: Array<number>) {
	for (const userId of userIds) {
		Events.publish(Events.notificationsChannel(userId));
	}
}

const sentNotifications = new Map<string, number>();

export function clearSentNotificationsForTesting() {
	sentNotifications.clear();
}

// deduplicates notifications as a failsafe & anti-abuse mechanism; entries
// expire so a legitimately repeated identical notification (e.g. the same team
// requesting a scrim again weeks later) still gets delivered
function isNotificationAlreadySent(
	notification: Notification,
	userIds: Array<number>,
) {
	// e2e tests should not be affected by this
	if (IS_E2E_TEST_RUN) {
		return false;
	}

	// bulk notifications are typically not something you can repeat
	if (userIds.length > 10) {
		return false;
	}

	const sortedUserIds = [...userIds].sort((a, b) => a - b).join(",");
	const key = `${notification.type}-${JSON.stringify(notificationMeta(notification))}-${sortedUserIds}`;
	const sentAt = sentNotifications.get(key);
	if (sentAt && Date.now() - sentAt < SENT_NOTIFICATION_TTL_MS) {
		return true;
	}
	sentNotifications.set(key, Date.now());

	if (sentNotifications.size > 10_000) {
		sentNotifications.clear();
	}

	return false;
}
