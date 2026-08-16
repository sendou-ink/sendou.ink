import { db } from "#lib/server/db/sql.ts";
import { NOTIFICATIONS } from "./notifications-constants.ts";
import type { Notification } from "./notifications-types.ts";

/** The user's newest notifications with their seen status, newest first. */
export function findByUserId(
	userId: number,
	{ limit }: { limit?: number } = {},
) {
	return db
		.selectFrom("NotificationUser")
		.innerJoin(
			"Notification",
			"Notification.id",
			"NotificationUser.notificationId",
		)
		.select([
			"Notification.id",
			"Notification.createdAt",
			"NotificationUser.seen",
			"Notification.type",
			"Notification.meta",
			"Notification.pictureUrl",
		])
		.where("NotificationUser.userId", "=", userId)
		.limit(limit ?? NOTIFICATIONS.MAX_SHOWN)
		.orderBy("Notification.id", "desc")
		.execute() as Promise<
		Array<Notification & { id: number; createdAt: number; seen: number }>
	>;
}
