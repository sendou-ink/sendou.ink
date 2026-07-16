import { db } from "~/db/sql";
import type { TablesInsertable } from "~/db/tables";
import { databaseTimestampNow } from "~/utils/dates";

/**
 * Inserts a report or, when the (reporter, reported) pair already has one, overwrites
 * its category and description bumping `createdAt`. Returns whether an existing report
 * was updated instead of a new one created.
 */
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

		await trx
			.insertInto("UserReport")
			.values(args)
			.onConflict((oc) =>
				oc.columns(["reportedUserId", "reporterUserId"]).doUpdateSet({
					category: args.category,
					description: args.description,
					createdAt: databaseTimestampNow(),
				}),
			)
			.execute();

		return { isUpdate: Boolean(existing) };
	});
}

/** Returns all reports made against the given user, newest first, with the reporter's identifying info. */
export function findAllByReportedUserId(reportedUserId: number) {
	return db
		.selectFrom("UserReport")
		.innerJoin("User", "User.id", "UserReport.reporterUserId")
		.select([
			"UserReport.id",
			"UserReport.category",
			"UserReport.description",
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
