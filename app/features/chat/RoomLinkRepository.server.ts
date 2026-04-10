import { sub } from "date-fns";
import { db } from "~/db/sql";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";

export function upsert(args: { userId: number; url: string }) {
	return db
		.insertInto("RoomLink")
		.values({
			userId: args.userId,
			url: args.url,
		})
		.onConflict((oc) =>
			oc.column("userId").doUpdateSet({
				url: args.url,
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

export function refreshTimestamp(userId: number) {
	return db
		.updateTable("RoomLink")
		.set({ refreshedAt: databaseTimestampNow() })
		.where("userId", "=", userId)
		.execute();
}
