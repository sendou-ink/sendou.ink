import type { Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import * as Seasons from "~/features/mmr/core/Seasons";
import { dateToDatabaseTimestamp } from "~/utils/dates";

type ModAuditLogType = Tables["ModAuditLog"]["type"];

/** Logs a text written by the acting user, in the caller's transaction. */
export function insert(
	{ type, text }: { type: ModAuditLogType; text: string },
	trx: Transaction<DB>,
) {
	return trx
		.insertInto("ModAuditLog")
		.values({ type, text, userId: actorId() })
		.returning("id")
		.executeTakeFirstOrThrow();
}

/** Texts of the type the user wrote during the season, newest first. */
export function findSeasonByUserId({
	userId,
	season,
	type,
}: {
	userId: number;
	season: number;
	type: ModAuditLogType;
}) {
	const { starts, ends } = Seasons.nthToDateRange(season);

	return db
		.selectFrom("ModAuditLog")
		.select(["ModAuditLog.id", "ModAuditLog.text", "ModAuditLog.createdAt"])
		.where("ModAuditLog.userId", "=", userId)
		.where("ModAuditLog.type", "=", type)
		.where("ModAuditLog.createdAt", ">=", dateToDatabaseTimestamp(starts))
		.where("ModAuditLog.createdAt", "<=", dateToDatabaseTimestamp(ends))
		.orderBy("ModAuditLog.createdAt", "desc")
		.orderBy("ModAuditLog.id", "desc")
		.execute();
}
