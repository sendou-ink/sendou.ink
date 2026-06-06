import { sub } from "date-fns";
import { db } from "~/db/sql";
import { actorId } from "~/features/auth/core/user.server";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";

export function upsertOwn(url: string) {
	return db
		.insertInto("RoomLink")
		.values({
			userId: actorId(),
			url,
		})
		.onConflict((oc) =>
			oc.column("userId").doUpdateSet({
				url,
				createdAt: databaseTimestampNow(),
				refreshedAt: databaseTimestampNow(),
			}),
		)
		.execute();
}

export function findByUserIds(userIds: number[], maxAgeHours: number) {
	return db
		.selectFrom("RoomLink")
		.select([
			"RoomLink.userId",
			"RoomLink.url",
			"RoomLink.createdAt",
			"RoomLink.refreshedAt",
		])
		.where("RoomLink.userId", "in", userIds)
		.where(
			"RoomLink.createdAt",
			">=",
			dateToDatabaseTimestamp(sub(new Date(), { hours: maxAgeHours })),
		)
		.orderBy("RoomLink.refreshedAt", "asc")
		.execute();
}

export function refreshOwnTimestamp() {
	return db
		.updateTable("RoomLink")
		.set({ refreshedAt: databaseTimestampNow() })
		.where("userId", "=", actorId())
		.execute();
}

export function deleteOld() {
	return db
		.deleteFrom("RoomLink")
		.where(
			"refreshedAt",
			"<",
			dateToDatabaseTimestamp(sub(new Date(), { hours: 2 })),
		)
		.executeTakeFirst();
}
