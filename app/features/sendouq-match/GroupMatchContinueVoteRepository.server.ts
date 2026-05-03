import type { Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB, DBBoolean } from "~/db/tables";

export async function findForGroups(groupIds: number[], trx?: Transaction<DB>) {
	if (groupIds.length === 0) return [];

	const executor = trx ?? db;

	const rows = await executor
		.selectFrom("GroupMatchContinueVote")
		.select([
			"GroupMatchContinueVote.groupId",
			"GroupMatchContinueVote.userId",
			"GroupMatchContinueVote.isContinuing",
			"GroupMatchContinueVote.votedAt",
		])
		.where("GroupMatchContinueVote.groupId", "in", groupIds)
		.execute();

	return rows.map((row) => ({
		...row,
		isContinuing: Boolean(row.isContinuing),
	}));
}

export async function cast(
	{
		groupId,
		userId,
		isContinuing,
	}: {
		groupId: number;
		userId: number;
		isContinuing: DBBoolean;
	},
	trx?: Transaction<DB>,
) {
	const executor = trx ?? db;

	const runner = async (t: Transaction<DB>) => {
		if (isContinuing === 0) {
			// every vote is only valid for a specific continuing size
			// e.g. if i want to keep going with a full group, i might not
			// want to continue with just 3 people -> revote required from all
			await t
				.deleteFrom("GroupMatchContinueVote")
				.where("GroupMatchContinueVote.groupId", "=", groupId)
				.where("GroupMatchContinueVote.isContinuing", "=", 1)
				.execute();
		}

		await t
			.insertInto("GroupMatchContinueVote")
			.values({ groupId, userId, isContinuing })
			.onConflict((oc) =>
				oc.columns(["groupId", "userId"]).doUpdateSet({ isContinuing }),
			)
			.execute();
	};

	if (trx) {
		await runner(trx);
		return;
	}
	await executor.transaction().execute(runner);
}
