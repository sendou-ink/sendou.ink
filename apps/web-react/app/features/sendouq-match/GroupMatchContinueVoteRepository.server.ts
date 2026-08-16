import type { Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import { toDBBoolean } from "~/utils/sql";

/** Every continue vote cast in the given groups. */
export async function findAllByGroupIds(
	groupIds: number[],
	trx?: Transaction<DB>,
) {
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

/**
 * Records the logged in user's vote on continuing with their group. Voting against continuing also
 * clears the group's votes in favor, since those were cast for a group size that no longer applies.
 */
export async function castOwnVote(
	{
		groupId,
		isContinuing,
	}: {
		groupId: number;
		isContinuing: boolean;
	},
	trx?: Transaction<DB>,
) {
	const userId = actorId();
	const executor = trx ?? db;
	const isContinuingValue = toDBBoolean(isContinuing);

	const runner = async (t: Transaction<DB>) => {
		if (!isContinuing) {
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
			.values({ groupId, userId, isContinuing: isContinuingValue })
			.onConflict((oc) =>
				oc
					.columns(["groupId", "userId"])
					.doUpdateSet({ isContinuing: isContinuingValue }),
			)
			.execute();
	};

	if (trx) {
		await runner(trx);
		return;
	}
	await executor.transaction().execute(runner);
}
