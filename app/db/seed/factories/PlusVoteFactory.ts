import { sub } from "date-fns";
import { db } from "~/db/sql";
import * as AdminRepository from "~/features/admin/AdminRepository.server";
import { lastCompletedVoting } from "~/features/plus-voting/core/voting-time";
import type { UpsertManyPlusVotesArgs } from "~/features/plus-voting/PlusVotingRepository.server";
import * as PlusVotingRepository from "~/features/plus-voting/PlusVotingRepository.server";
import { PLUS_UPVOTE } from "~/features/plus-voting/plus-voting-constants";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { defineFactory } from "../core/defineFactory";

type Vote = UpsertManyPlusVotesArgs[number];

const VOTING_ENDED_AGO = { minutes: 5 };

/** `authorId` cast the vote on `votedId`. Defaults to the latest completed voting, which already counts towards tiers. */
export const { create, createMany } = defineFactory({
	defaults: () => ({
		...lastCompletedVoting(new Date()),
		tier: 1,
		score: PLUS_UPVOTE,
		becomesValidAt: dateToDatabaseTimestamp(sub(new Date(), VOTING_ENDED_AGO)),
	}),
	insert: async (vote: Vote) => {
		// `upsertMany` replaces every vote the author cast that month, so earlier ones are read back and sent along
		const alreadyCast = await db
			.selectFrom("PlusVote")
			.selectAll()
			.where("authorId", "=", vote.authorId)
			.where("month", "=", vote.month)
			.where("year", "=", vote.year)
			.execute();

		await PlusVotingRepository.upsertMany([...alreadyCast, vote]);

		return vote;
	},
});

/** Recounts the plus tiers from the latest completed voting, as the monthly sync does. */
export async function syncTiers() {
	const tiers = await PlusVotingRepository.findAllPlusTiersFromLatestVoting();
	if (tiers.length === 0) return;

	await AdminRepository.replacePlusTiers(tiers);
}
