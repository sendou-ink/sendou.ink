import type { TFunction } from "i18next";
import pLimit from "p-limit";
import { type Urgency, WebPushError } from "web-push";
import type { NotificationSubscription } from "~/db/tables-json";
import * as ChatSystemMessage from "~/features/chat/ChatSystemMessage.server";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import { APP_ICON_URL, type UserLinkArgs } from "~/utils/urls";
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
	SEASON_ENDED: "normal",
	SCRIM_NEW_REQUEST: "high",
	SCRIM_SCHEDULED: "high",
	SCRIM_CANCELED: "high",
	SCRIM_STARTING_SOON: "high",
	SCRIM_AUTO_DELETED: "normal",
	COMMISSIONS_CLOSED: "normal",
	FRIEND_REQUEST_RECEIVED: "normal",
	TEAM_EVENT_ADDED: "normal",
	SCHEDULE_TEAM_REMINDER: "normal",
};

/** How long a push is held back; anything marking the notification seen meanwhile (addressing it, opening the list, `defaultSeenUserIds`) cancels it for that user. */
export const PUSH_NOTIFICATION_GRACE_PERIOD_MS = 15 * 1000;

/** Creates notifications and sends pushes (if enabled) after {@link PUSH_NOTIFICATION_GRACE_PERIOD_MS}, only to users whose notification is still unseen by then. */
export async function notify({
	userIds,
	notification,
	defaultSeenUserIds,
	skipPushGracePeriod,
}: {
	userIds: Array<number>;
	/** User ids that get the notification already marked as seen */
	defaultSeenUserIds?: Array<number>;
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
		subscriptions.map(({ id, subscription, discordId, customUrl }) =>
			limit(() =>
				sendPushNotification({
					subscription,
					subscriptionId: id,
					notification,
					recipient: { discordId, customUrl },
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

// failsafe & anti-abuse dedupe; entries expire so a legitimately repeated identical
// notification (the same team requesting a scrim again weeks later) still gets delivered
function isNotificationAlreadySent(
	notification: Notification,
	userIds: Array<number>,
) {
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
	recipient,
	t,
}: {
	subscription: NotificationSubscription;
	subscriptionId: number;
	notification: Notification;
	recipient: UserLinkArgs;
	t: TFunction<["common"], undefined>;
}) {
	try {
		await webPush.sendNotification(
			subscription,
			JSON.stringify(pushNotificationOptions(notification, recipient, t)),
			{ urgency: NOTIFICATION_URGENCY[notification.type] },
		);
	} catch (err) {
		if (!(err instanceof WebPushError)) {
			logger.error("Failed to send push notification (unknown error)", err);
			// "Not Found" / "Gone": the subscription is expired or no longer valid
		} else if (err.statusCode === 404 || err.statusCode === 410) {
			await NotificationRepository.deleteSubscriptionById(subscriptionId);
		} else {
			logger.error("Failed to send push notification", err);
		}
	}
}

function pushNotificationOptions(
	notification: Notification,
	recipient: UserLinkArgs,
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
		data: { url: notificationLink(notification, recipient) },
	};
}
