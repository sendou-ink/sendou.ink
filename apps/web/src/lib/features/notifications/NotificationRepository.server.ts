import { sql } from "kysely";
import * as R from "remeda";
import { actorId } from "#lib/features/auth/user.server.ts";
import { db } from "#lib/server/db/sql.ts";
import type { TablesInsertable } from "#lib/server/db/tables.ts";
import { NOTIFICATIONS } from "./notifications-constants.ts";
import type { Notification } from "./notifications-types.ts";
import { notificationMeta } from "./notifications-utils.ts";

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

/**
 * Marks the users' unseen notifications of the given type as seen, optionally
 * only those whose meta matches every given key/value pair. Used to clear the
 * unseen dot when the user addresses what the notification is about. Returns
 * the user ids whose rows actually changed.
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

/**
 * Marks the actor's notifications as seen. Returns the actor's user id in an
 * array if any row actually changed (empty array otherwise), shaped for
 * passing straight to the notifications-changed publish.
 */
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
