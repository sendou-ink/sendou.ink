import type { TFunction } from "i18next";
import pLimit from "p-limit";
import { type Urgency, WebPushError } from "web-push";
import type { NotificationSubscription } from "~/db/tables-json";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import { APP_ICON_URL } from "~/utils/urls";
import { getFixedTForLanguage } from "../../../modules/i18n/i18next.server";
import { logger } from "../../../utils/logger";
import * as NotificationRepository from "../NotificationRepository.server";
import type { Notification } from "../notifications-types";
import { notificationLink, notificationMeta } from "../notifications-utils";
import webPush, { webPushEnabled } from "./webPush.server";

const NOTIFICATION_URGENCY: Record<Notification["type"], Urgency> = {
	SQ_ADDED_TO_GROUP: "high",
	SQ_NEW_MATCH: "high",
	SQ_READY_CHECK: "high",
	TO_ADDED_TO_TEAM: "normal",
	TO_BRACKET_STARTED: "high",
	TO_CHECK_IN_OPENED: "high",
	TO_TEST_CREATED: "normal",
	TO_LIKE_RECEIVED: "high",
	TO_LIKE_ACCEPTED: "high",
	BADGE_ADDED: "normal",
	BADGE_MANAGER_ADDED: "normal",
	TROPHY_SUBMITTED: "normal",
	TROPHY_SUBMISSION_ACCEPTED: "normal",
	TROPHY_SUBMISSION_DECLINED: "normal",
	PLUS_VOTING_STARTED: "normal",
	PLUS_SUGGESTION_ADDED: "normal",
	TAGGED_TO_ART: "normal",
	SEASON_STARTED: "normal",
	SCRIM_NEW_REQUEST: "high",
	SCRIM_SCHEDULED: "high",
	SCRIM_CANCELED: "high",
	SCRIM_STARTING_SOON: "high",
	SCRIM_AUTO_DELETED: "normal",
	COMMISSIONS_CLOSED: "normal",
	FRIEND_REQUEST_RECEIVED: "normal",
};

/** How long a push notification is held back before sending. Anything marking the notification as seen during this window (the user addressing what it is about, opening the notification list, `defaultSeenUserIds`) cancels the push for that user. */
export const PUSH_NOTIFICATION_GRACE_PERIOD_MS = 15 * 1000;

/**
 * Create notifications both in the database and send push notifications to users (if enabled).
 *
 * Pushes go out after {@link PUSH_NOTIFICATION_GRACE_PERIOD_MS} and only to
 * users whose notification is still unseen at that point, so users who already
 * saw the event happen in-app are not pushed about it.
 */
export async function notify({
	userIds,
	notification,
	defaultSeenUserIds,
	skipPushGracePeriod,
}: {
	/** Array of user ids to notify */
	userIds: Array<number>;
	/** Array of user ids that should have the notification marked as seen by default */
	defaultSeenUserIds?: Array<number>;
	/** Notification to send (same for all users) */
	notification: Notification;
	/** Send push notifications right away and await them (used by the send-test-notification script) */
	skipPushGracePeriod?: boolean;
}) {
	if (userIds.length === 0) {
		return;
	}

	const dededuplicatedUserIds = Array.from(new Set(userIds));

	if (isNotificationAlreadySent(notification, dededuplicatedUserIds)) {
		return;
	}

	let notificationId: number;
	try {
		const inserted = await NotificationRepository.insert(
			notification,
			dededuplicatedUserIds.map((userId) => ({
				userId,
				seen: defaultSeenUserIds?.includes(userId) ? 1 : 0,
			})),
		);
		notificationId = inserted.id;
		ChatSystemMessage.notifyNotificationsChanged(dededuplicatedUserIds);
	} catch (e) {
		logger.error("Failed to notify users", e);
		return;
	}

	if (skipPushGracePeriod) {
		await sendPushNotificationsToUnseen({ notificationId, notification });
	} else {
		schedulePushNotifications({ notificationId, notification });
	}
}

function schedulePushNotifications({
	notificationId,
	notification,
}: {
	notificationId: number;
	notification: Notification;
}) {
	if (!webPushEnabled) return;

	setTimeout(() => {
		sendPushNotificationsToUnseen({ notificationId, notification }).catch(
			(err) => logger.error("Failed to send push notifications", err),
		);
	}, PUSH_NOTIFICATION_GRACE_PERIOD_MS).unref();
}

async function sendPushNotificationsToUnseen({
	notificationId,
	notification,
}: {
	notificationId: number;
	notification: Notification;
}) {
	if (!webPushEnabled) return;

	const subscriptions =
		await NotificationRepository.findUnseenSubscriptionsByNotificationId(
			notificationId,
		);
	if (subscriptions.length === 0) return;

	const t = await getFixedTForLanguage("en-US", ["common"]);

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

const SENT_NOTIFICATION_TTL_MS = 1000 * 60 * 60;

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
		await webPush.sendNotification(
			subscription,
			JSON.stringify(pushNotificationOptions(notification, t)),
			{ urgency: NOTIFICATION_URGENCY[notification.type] },
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
			notificationMeta(notification),
		),
		icon: notification.pictureUrl ?? APP_ICON_URL,
		data: { url: notificationLink(notification) },
	};
}
