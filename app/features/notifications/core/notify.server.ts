import type { TFunction } from "i18next";
import { WebPushError } from "web-push";
import i18next from "../../../modules/i18n/i18next.server";
import { logger } from "../../../utils/logger";
import * as NotificationRepository from "../NotificationRepository.server";
import type { Notification } from "../notifications-types";
import { notificationLink } from "../notifications-utils";
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

	const subscriptions =
		await NotificationRepository.subscriptionsByUserIds(userIds);
	if (subscriptions.length > 0) {
		const t = await i18next.getFixedT("en-US", ["common"]);

		for (const { id, subscription } of subscriptions) {
			try {
				await webPush.sendNotification(
					subscription,
					JSON.stringify(pushNotificationOptions(notification, t)),
				);
			} catch (err) {
				if (!(err instanceof WebPushError)) {
					logger.error("Failed to send push notification (unknown error)", err);
					// if we get "Not Found" or "Gone" we should delete the subscription as it is expired or no longer valid
				} else if (err.statusCode === 404 || err.statusCode === 410) {
					await NotificationRepository.deleteSubscriptionById(id);
				} else {
					logger.error("Failed to send push notification", err);
				}
			}
		}
	}
}

function pushNotificationOptions(
	notification: Notification,
	t: TFunction<["common"], undefined>,
): Parameters<ServiceWorkerRegistration["showNotification"]>[1] & {
	title: string;
} {
	return {
		title: t(`common:notifications.title.${notification.type}`),
		body: t(
			`common:notifications.text.${notification.type}`,
			// @ts-expect-error: not every notification has meta but it is ok
			notification.meta,
		),
		icon: notification.pictureUrl ?? "/static-assets/img/app-icon.png",
		data: { url: notificationLink(notification) },
	};
}
