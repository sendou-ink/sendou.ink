import * as v from "valibot";
import { getUser, requireUser } from "#lib/features/auth/user.server.ts";
import * as Events from "#lib/server/events.ts";
import { command, getRequestEvent, query } from "$app/server";
import * as NotificationRepository from "./NotificationRepository.server.ts";
import { notifyNotificationsChanged } from "./core/notify.server.ts";
import { NOTIFICATIONS } from "./notifications-constants.ts";

/**
 * The notification peek shown in the bell popover, streamed live: a new
 * notification (or a resolution) publishes to the user's channel and every
 * open tab gets the fresh list without polling. Replaces the React app's
 * `GET /api/notifications` + skalop `NOTIFICATIONS_CHANGED` ping.
 */
export const getNotifications = query.live(async function* () {
	const user = getUser();

	if (!user) {
		yield { notifications: undefined };
		return;
	}

	yield await peek(user.id);

	for await (const _ of Events.subscribe(Events.notificationsChannel(user.id), {
		signal: getRequestEvent().request.signal,
	})) {
		yield await peek(user.id);
	}
});

async function peek(userId: number) {
	return {
		notifications: await NotificationRepository.findByUserId(userId, {
			limit: NOTIFICATIONS.PEEK_COUNT,
		}),
	};
}

/** Marks the actor's notifications as seen (opening the bell popover). */
export const markNotificationsSeen = command(
	v.object({
		notificationIds: v.array(v.pipe(v.number(), v.integer(), v.minValue(1))),
	}),
	async ({ notificationIds }) => {
		requireUser();

		if (notificationIds.length === 0) return;

		const changedUserIds =
			await NotificationRepository.markOwnAsSeen(notificationIds);
		// other tabs/devices of the same user drop their dot too
		notifyNotificationsChanged(changedUserIds);
	},
);
