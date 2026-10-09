import { requireUser } from "~/features/auth/core/user.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import type { PlusVoteFromFE } from "~/features/plus-voting/core";
import {
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";
import { isVotingOpen } from "~/features/plus-voting/core/voting-time";
import * as PlusVotingRepository from "~/features/plus-voting/PlusVotingRepository.server";
import { defineAction } from "~/form/define-action.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { invariant } from "~/utils/invariant";
import { badRequest, badRequestIfFalsy } from "~/utils/remix.server";
import { PLUS_UPVOTE } from "../plus-voting-constants";
import { votingActionSchema } from "../plus-voting-schemas";

export const action = defineAction(
	{ body: votingActionSchema },
	async ({ body }) => {
		const user = requireUser();

		if (!isVotingOpen()) {
			badRequest();
		}

		invariant(user.plusTier, "User should have plusTier");

		const usersForVoting = await PlusVotingRepository.findAllUsersForVoting({
			id: user.id,
			plusTier: user.plusTier,
		});

		// resilience against a bug listing a user twice or one who should not be included
		const seen = new Set<number>();
		const filteredVotes = body.votes.filter((vote) => {
			if (seen.has(vote.votedId)) {
				return false;
			}
			seen.add(vote.votedId);
			return usersForVoting.some((u) => u.user.id === vote.votedId);
		});

		validateVotes({ votes: filteredVotes, usersForVoting });

		// freebie +1 for yourself if you vote
		const votesForDb = [...filteredVotes].concat({
			votedId: user.id,
			score: PLUS_UPVOTE,
		});

		const votingRange = badRequestIfFalsy(nextNonCompletedVoting(new Date()));
		const { month, year } = rangeToMonthYear(votingRange);
		await PlusVotingRepository.upsertMany(
			votesForDb.map((vote) => ({
				...vote,
				authorId: user.id,
				month,
				year,
				tier: user.plusTier!, // no clue why i couldn't make narrowing the type down above work
				becomesValidAt: dateToDatabaseTimestamp(votingRange.endDate),
			})),
		);

		await resolveNotifications({
			userIds: [user.id],
			type: "PLUS_VOTING_STARTED",
		});

		return null;
	},
);

function validateVotes({
	votes,
	usersForVoting,
}: {
	votes: PlusVoteFromFE[];
	usersForVoting?: PlusVotingRepository.UsersForVoting;
}) {
	if (!usersForVoting) badRequest();

	// converting it to set also handles the check for duplicate ids
	const votedUserIds = new Set(votes.map((v) => v.votedId));

	if (votedUserIds.size !== usersForVoting.length) {
		badRequest();
	}

	for (const { user } of usersForVoting) {
		if (!votedUserIds.has(user.id)) {
			badRequest();
		}
	}
}
