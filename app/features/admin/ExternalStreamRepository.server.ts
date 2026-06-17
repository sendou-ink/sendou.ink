import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";
import { databaseTimestampNow } from "~/utils/dates";
import { concatUserSubmittedImagePrefix } from "~/utils/kysely.server";

/** Number of seconds an external stream keeps showing in the sidebar after its start time. */
const SIDEBAR_VISIBLE_SECONDS = 6 * 60 * 60;
/** Number of seconds after the start time before an external stream row is deleted. */
const RETENTION_SECONDS = 24 * 60 * 60;

/** Inserts a new admin-curated external stream. */
export function insert(
	args: Pick<
		TablesInsertable["ExternalStream"],
		"name" | "url" | "avatarImgId" | "startTime"
	>,
) {
	return db.insertInto("ExternalStream").values(args).execute();
}

/** Deletes an external stream by its id. */
export function deleteById(id: number) {
	return db.deleteFrom("ExternalStream").where("id", "=", id).execute();
}

/** Lists all external streams (for the admin management page), soonest start time first. */
export function all() {
	return db
		.selectFrom("ExternalStream")
		.leftJoin(
			"UserSubmittedImage",
			"UserSubmittedImage.id",
			"ExternalStream.avatarImgId",
		)
		.select((eb) => [
			"ExternalStream.id",
			"ExternalStream.name",
			"ExternalStream.url",
			"ExternalStream.startTime",
			concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
				"avatarUrl",
			),
		])
		.orderBy("ExternalStream.startTime", "asc")
		.execute();
}

/** External streams that should currently show in the sidebar (started under 6h ago or upcoming). */
export function forSidebar() {
	return db
		.selectFrom("ExternalStream")
		.leftJoin(
			"UserSubmittedImage",
			"UserSubmittedImage.id",
			"ExternalStream.avatarImgId",
		)
		.select((eb) => [
			"ExternalStream.id",
			"ExternalStream.name",
			"ExternalStream.url",
			"ExternalStream.startTime",
			concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
				"avatarUrl",
			),
		])
		.where(
			"ExternalStream.startTime",
			">=",
			databaseTimestampNow() - SIDEBAR_VISIBLE_SECONDS,
		)
		.execute();
}

/** Deletes external streams whose start time is more than 24h in the past. */
export function deleteOld() {
	return db
		.deleteFrom("ExternalStream")
		.where("startTime", "<", databaseTimestampNow() - RETENTION_SECONDS)
		.executeTakeFirst();
}
