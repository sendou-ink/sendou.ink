import { db } from "~/db/sql";
import type { NotificationSubscription, TablesInsertable } from "~/db/tables";
import { NOTIFICATIONS } from "./notifications-contants";
import type { Notification } from "./notifications-types";

export function insert(
	notification: Notification,
	users: Array<Omit<TablesInsertable["NotificationUser"], "notificationId">>,
) {
	return db.transaction().execute(async (trx) => {
		const inserted = await trx
			.insertInto("Notification")
			.values({
				...notification,
				// @ts-expect-error: not every notification has meta but it is ok
				meta: notification.meta ? JSON.stringify(notification.meta) : null,
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("NotificationUser")
			.values(
				users.map((user) => ({
					...user,
					notificationId: inserted.id,
				})),
			)
			.execute();
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

export function markAsSeen({
	notificationIds,
	userId,
}: {
	notificationIds: number[];
	userId: number;
}) {
	return db
		.updateTable("NotificationUser")
		.set("seen", 1)
		.where("NotificationUser.notificationId", "in", notificationIds)
		.where("NotificationUser.userId", "=", userId)
		.execute();
}

export function addSubscription(args: {
	userId: number;
	subscription: NotificationSubscription;
}) {
	return db
		.insertInto("NotificationUserSubscription")
		.values({
			userId: args.userId,
			subscription: JSON.stringify(args.subscription),
		})
		.execute();
}

export function subscriptionsByUserIds(userIds: number[]) {
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
