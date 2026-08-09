import { sub } from "date-fns";
import { sql } from "kysely";
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
 * Marks the users' unseen notifications of the given type as seen, optionally
 * only those whose meta matches every given key/value pair. Used to clear the
 * unseen dot when the user addresses what the notification is about.
 *
 * The correlated `exists` keeps this proportional to the users' own
 * notifications. A `notificationId in (select ...)` reads the same but makes
 * SQLite materialize every notification of the type (json_extract'ing each one)
 * before touching the user's rows, which is ~80x slower on a hot path.
 */
export async function markAsSeenByType({
	userIds,
	type,
	meta,
}: {
	userIds: number[];
	type: Notification["type"];
	meta?: Record<string, number | string>;
}) {
	if (userIds.length === 0) return;

	await db
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
		.execute();
}

export function markOwnAsSeen(notificationIds: number[]) {
	return db
		.updateTable("NotificationUser")
		.set("seen", 1)
		.where("NotificationUser.notificationId", "in", notificationIds)
		.where("NotificationUser.userId", "=", actorId())
		.execute();
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

export function insertOwnSubscription(subscription: NotificationSubscription) {
	return db
		.insertInto("NotificationUserSubscription")
		.values({
			userId: actorId(),
			subscription: JSON.stringify(subscription),
		})
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
