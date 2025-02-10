import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";
import { NOTIFICATIONS } from "./notifications-contants";

// xxx: optimize this, we could for example use raw sqlite and insert all at once while reusing same statements?
export function insertMany(args: Array<TablesInsertable["Notification"]>) {
	return db.transaction().execute(async (trx) => {
		for (const arg of args) {
			await trx.insertInto("Notification").values(arg).execute();
		}
	});
}

export function findByUserId(
	userId: number,
	{ limit }: { limit?: number } = {},
) {
	return db
		.selectFrom("Notification")
		.select([
			"Notification.id",
			"Notification.createdAt",
			"Notification.seen",
			"Notification.value",
		])
		.where("userId", "=", userId)
		.orderBy("id", "desc")
		.limit(limit ?? NOTIFICATIONS.MAX_SHOWN)
		.execute();
}

export function markAsSeen({
	notificationIds,
	userId,
}: {
	notificationIds: number[];
	userId: number;
}) {
	return db
		.updateTable("Notification")
		.set("seen", 1)
		.where("Notification.id", "in", notificationIds)
		.where("Notification.userId", "=", userId)
		.execute();
}
