import { sub } from "date-fns";
import { sql } from "kysely";
import * as R from "remeda";
import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";
import type { NotificationSubscription } from "~/db/tables-json";
import { actorId } from "~/features/auth/core/user.server";
import { dateToDatabaseTimestamp } from "../../utils/dates";
import { NOTIFICATIONS } from "./notifications-contants";
import type { Notification } from "./notifications-types";
import { notificationMeta } from "./notifications-utils";

export function insert(
	notification: Notification,
	users: Array<Omit<TablesInsertable["NotificationUser"], "notificationId">>,
) {
	return db.transaction().execute(async (trx) => {
		const inserted = await trx
			.insertInto("Notification")
			.values({
				type: notification.type,
				pictureUrl: notification.pictureUrl,
				meta: notificationMeta(notification)
					? JSON.stringify(notificationMeta(notification))
					: null,
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("NotificationUser")
			.values(
				users.map(({ userId, seen }) => ({
					userId,
					notificationId: inserted.id,
					seen: seen ?? 0,
				})),
			)
			.execute();

		return inserted;
	});
}

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

export function findAllByType<T extends Notification["type"]>(type: T) {
	return db
		.selectFrom("Notification")
		.select(["type", "meta", "pictureUrl"])
		.where("type", "=", type)
		.execute() as Promise<Array<Extract<Notification, { type: T }>>>;
}

/**
 * Marks the users' unseen notifications of the type (optionally only those whose meta matches
 * every key/value) as seen, returning the user ids whose rows changed. The correlated `exists`
 * keeps this proportional to the users' own notifications; `notificationId in (select ...)` makes
 * SQLite materialize every notification of the type first, ~80x slower on a hot path.
 */
export async function markAsSeenByType({
	userIds,
	type,
	meta,
}: {
	userIds: number[];
	type: Notification["type"];
	meta?: Record<string, number | string>;
}): Promise<number[]> {
	if (userIds.length === 0) return [];

	const updated = await db
		.updateTable("NotificationUser")
		.set("seen", 1)
		.where("NotificationUser.seen", "=", 0)
		.where("NotificationUser.userId", "in", userIds)
		.where(({ exists, selectFrom, ref }) => {
			let matchingNotification = selectFrom("Notification")
				.select("Notification.id")
				.whereRef(
					"Notification.id",
					"=",
					ref("NotificationUser.notificationId"),
				)
				.where("Notification.type", "=", type);

			for (const [key, value] of Object.entries(meta ?? {})) {
				matchingNotification = matchingNotification.where(
					sql`json_extract("Notification"."meta", ${`$.${key}`})`,
					"=",
					value,
				);
			}

			return exists(matchingNotification);
		})
		.returning("NotificationUser.userId")
		.execute();

	return R.unique(updated.map((row) => row.userId));
}

/** Marks the actor's notifications as seen. Returns `[actorId]` if any row changed, else `[]`, shaped for `ChatSystemMessage.notifyNotificationsChanged`. */
export async function markOwnAsSeen(notificationIds: number[]) {
	const updated = await db
		.updateTable("NotificationUser")
		.set("seen", 1)
		.where("NotificationUser.notificationId", "in", notificationIds)
		.where("NotificationUser.userId", "=", actorId())
		.where("NotificationUser.seen", "=", 0)
		.returning("NotificationUser.userId")
		.execute();

	return updated.length > 0 ? [updated[0].userId] : [];
}

export function deleteOld() {
	return db
		.deleteFrom("Notification")
		.where(
			"createdAt",
			"<",
			dateToDatabaseTimestamp(sub(new Date(), { days: 14 })),
		)
		.executeTakeFirst();
}

export function upsertOwnSubscription(subscription: NotificationSubscription) {
	return db
		.insertInto("NotificationUserSubscription")
		.values({
			userId: actorId(),
			subscription: JSON.stringify(subscription),
		})
		.onConflict((oc) =>
			// an endpoint identifies one browser; a resubscribe or another user
			// logging in on the same browser takes the row over instead of
			// duplicating deliveries to it
			oc
				.expression(sql`json_extract("subscription", '$.endpoint')`)
				.doUpdateSet({
					userId: actorId(),
					subscription: JSON.stringify(subscription),
				}),
		)
		.execute();
}

/** Push subscriptions of the notification's recipients who have not seen it yet, so the push sender skips users who addressed it during the grace period. */
export function findUnseenSubscriptionsByNotificationId(
	notificationId: number,
) {
	return db
		.selectFrom("NotificationUser")
		.innerJoin(
			"NotificationUserSubscription",
			"NotificationUserSubscription.userId",
			"NotificationUser.userId",
		)
		.innerJoin("User", "User.id", "NotificationUser.userId")
		.select([
			"NotificationUserSubscription.id",
			"NotificationUserSubscription.subscription",
			"User.discordId",
			"User.customUrl",
		])
		.where("NotificationUser.notificationId", "=", notificationId)
		.where("NotificationUser.seen", "=", 0)
		.execute();
}

export function findAllSubscriptionsByUserIds(userIds: number[]) {
	return db
		.selectFrom("NotificationUserSubscription")
		.select(["id", "subscription"])
		.where("userId", "in", userIds)
		.execute();
}

export function deleteSubscriptionById(id: number) {
	return db
		.deleteFrom("NotificationUserSubscription")
		.where("id", "=", id)
		.execute();
}
