import type { ActionFunction } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import { resolveNotifications } from "~/features/notifications/core/resolve.server";
import type { PlusVoteFromFE } from "~/features/plus-voting/core";
import {
	nextNonCompletedVoting,
	rangeToMonthYear,
} from "~/features/plus-voting/core";
import { isVotingOpen } from "~/features/plus-voting/core/voting-time";
import * as PlusVotingRepository from "~/features/plus-voting/PlusVotingRepository.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { badRequestIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { PLUS_UPVOTE } from "../plus-voting-constants";
import { votingActionSchema } from "../plus-voting-schemas";

export const action: ActionFunction = async ({ request }) => {
	const user = requireUser();
	const data = await parseRequestPayload({
		request,
		schema: votingActionSchema,
	});

	if (!isVotingOpen()) {
		throw new Response(null, { status: 400 });
	}

	invariant(user.plusTier, "User should have plusTier");

	const usersForVoting = await PlusVotingRepository.findAllUsersForVoting({
		id: user.id,
		plusTier: user.plusTier,
	});

	// this should not be needed but makes the voting a bit more resilient
	// if there is a bug that causes some user to show up twice, or some user to show up who should not be included
	const seen = new Set<number>();
	const filteredVotes = data.votes.filter((vote) => {
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
};

function validateVotes({
	votes,
	usersForVoting,
}: {
	votes: PlusVoteFromFE[];
	usersForVoting?: PlusVotingRepository.UsersForVoting;
}) {
	if (!usersForVoting) throw new Response(null, { status: 400 });

	// converting it to set also handles the check for duplicate ids
	const votedUserIds = new Set(votes.map((v) => v.votedId));

	if (votedUserIds.size !== usersForVoting.length) {
		throw new Response(null, { status: 400 });
	}

	for (const { user } of usersForVoting) {
		if (!votedUserIds.has(user.id)) {
			throw new Response(null, { status: 400 });
		}
	}
}
