import { subMonths, subYears } from "date-fns";
import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";

/** Inserts, or overwrites the pair's existing report (bumping `createdAt`). Returns whether it was an update. */
export function upsert(
	args: Omit<TablesInsertable["UserReport"], "createdAt">,
) {
	return db.transaction().execute(async (trx) => {
		const existing = await trx
			.selectFrom("UserReport")
			.select("id")
			.where("reportedUserId", "=", args.reportedUserId)
			.where("reporterUserId", "=", args.reporterUserId)
			.executeTakeFirst();

		const { id } = await trx
			.insertInto("UserReport")
			.values(args)
			.onConflict((oc) =>
				oc.columns(["reportedUserId", "reporterUserId"]).doUpdateSet({
					category: args.category,
					description: args.description,
					matchId: args.matchId,
					createdAt: databaseTimestampNow(),
				}),
			)
			.returning("id")
			.executeTakeFirstOrThrow();

		return { id, isUpdate: Boolean(existing) };
	});
}

/** Reports against the user in the last month and in the last year. */
export async function countRecentByReportedUserId(reportedUserId: number) {
	const monthAgo = dateToDatabaseTimestamp(subMonths(new Date(), 1));
	const yearAgo = dateToDatabaseTimestamp(subYears(new Date(), 1));

	const row = await db
		.selectFrom("UserReport")
		.select((eb) => [
			eb.fn
				.countAll<number>()
				.filterWhere("createdAt", ">=", monthAgo)
				.as("lastMonth"),
			eb.fn.countAll<number>().as("lastYear"),
		])
		.where("reportedUserId", "=", reportedUserId)
		.where("createdAt", ">=", yearAgo)
		.executeTakeFirstOrThrow();

	return { lastMonth: row.lastMonth, lastYear: row.lastYear };
}

/** Reports against the user, newest first, with reporter info. */
export function findAllByReportedUserId(reportedUserId: number) {
	return db
		.selectFrom("UserReport")
		.innerJoin("User", "User.id", "UserReport.reporterUserId")
		.select([
			"UserReport.id",
			"UserReport.category",
			"UserReport.description",
			"UserReport.matchId",
			"UserReport.createdAt",
			"UserReport.reporterUserId",
			"User.username as reporterUsername",
			"User.discordId as reporterDiscordId",
			"User.customUrl as reporterCustomUrl",
		])
		.where("UserReport.reportedUserId", "=", reportedUserId)
		.orderBy("UserReport.createdAt", "desc")
		.execute();
}
