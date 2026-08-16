import { db } from "#lib/server/db/sql.ts";
import { concatUserSubmittedImagePrefix } from "#lib/server/kysely.ts";
import { databaseTimestampNow } from "#lib/utils/dates.ts";

const SIDEBAR_VISIBLE_SECONDS = 6 * 60 * 60;

/** External streams that should currently show in the sidebar (started under 6h ago or upcoming). */
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
