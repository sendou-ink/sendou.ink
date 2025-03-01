import type { TFunction } from "i18next";
import pLimit from "p-limit";
import { WebPushError } from "web-push";
import type { NotificationSubscription } from "../../../db/tables";
import i18next from "../../../modules/i18n/i18next.server";
import { logger } from "../../../utils/logger";
import * as NotificationRepository from "../NotificationRepository.server";
import type { Notification } from "../notifications-types";
import { notificationLink } from "../notifications-utils";
import webPush from "./webPush.server";

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

	if (isNotificationAlreadySent(notification)) {
		return;
	}

	const dededuplicatedUserIds = Array.from(new Set(userIds));

	try {
		await NotificationRepository.insert(
			notification,
			dededuplicatedUserIds.map((userId) => ({
				userId,
				seen: defaultSeenUserIds?.includes(userId) ? 1 : 0,
			})),
		);
	} catch (e) {
		console.error("Failed to notify users", e);
	}

	const subscriptions = await NotificationRepository.subscriptionsByUserIds(
		dededuplicatedUserIds,
	);
	if (subscriptions.length > 0) {
		const t = await i18next.getFixedT("en-US", ["common"]);

		const limit = pLimit(50);

		await Promise.all(
			subscriptions.map(({ id, subscription }) =>
				limit(() =>
					sendPushNotification({
						subscription,
						subscriptionId: id,
						notification,
						t,
					}),
				),
			),
		);
	}
}

const sentNotifications = new Set<string>();

// deduplicates notifications as a failsafe & anti-abuse mechanism
function isNotificationAlreadySent(notification: Notification) {
	// e2e tests should not be affected by this
	if (process.env.NODE_ENV !== "production") {
		return false;
	}

	const key = `${notification.type}-${JSON.stringify(notification.meta)}`;
	if (sentNotifications.has(key)) {
		return true;
	}
	sentNotifications.add(key);

	if (sentNotifications.size > 10_000) {
		sentNotifications.clear();
	}

	return false;
}

async function sendPushNotification({
	subscription,
	subscriptionId,
	notification,
	t,
}: {
	subscription: NotificationSubscription;
	subscriptionId: number;
	notification: Notification;
	t: TFunction<["common"], undefined>;
}) {
	try {
		logger.info("Sending...", subscription);
		await webPush.sendNotification(
			subscription,
			JSON.stringify(pushNotificationOptions(notification, t)),
		);
	} catch (err) {
		if (!(err instanceof WebPushError)) {
			logger.error("Failed to send push notification (unknown error)", err);
			// if we get "Not Found" or "Gone" we should delete the subscription as it is expired or no longer valid
		} else if (err.statusCode === 404 || err.statusCode === 410) {
			await NotificationRepository.deleteSubscriptionById(subscriptionId);
		} else {
			logger.error("Failed to send push notification", err);
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
			notification.meta,
		),
		icon: notification.pictureUrl ?? "/static-assets/img/app-icon.png",
		data: { url: notificationLink(notification) },
	};
}
