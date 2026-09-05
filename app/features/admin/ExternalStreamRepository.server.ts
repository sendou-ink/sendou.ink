import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";
import { databaseTimestampNow } from "~/utils/dates";
import { concatUserSubmittedImagePrefix } from "~/utils/kysely.server";

const SIDEBAR_VISIBLE_SECONDS = 6 * 60 * 60;
const RETENTION_SECONDS = 24 * 60 * 60;

/** Inserts an admin-curated external stream. */
export function insert(
	args: Pick<
		TablesInsertable["ExternalStream"],
		"name" | "url" | "avatarImgId" | "startsAt"
	>,
) {
	return db.insertInto("ExternalStream").values(args).execute();
}

/** Deletes an external stream by its id. */
export function deleteById(id: number) {
	return db.deleteFrom("ExternalStream").where("id", "=", id).execute();
}

/** All external streams, soonest first. */
export function findAll() {
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
			"ExternalStream.startsAt",
			concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
				"avatarUrl",
			),
		])
		.orderBy("ExternalStream.startsAt", "asc")
		.execute();
}

/** Streams started under 6h ago or upcoming. */
export function findAllForSidebar() {
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
			"ExternalStream.startsAt",
			concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
				"avatarUrl",
			),
		])
		.where(
			"ExternalStream.startsAt",
			">=",
			databaseTimestampNow() - SIDEBAR_VISIBLE_SECONDS,
		)
		.execute();
}

/** Deletes streams that started over 24h ago. */
export function deleteOld() {
	return db
		.deleteFrom("ExternalStream")
		.where("startsAt", "<", databaseTimestampNow() - RETENTION_SECONDS)
		.executeTakeFirst();
}
