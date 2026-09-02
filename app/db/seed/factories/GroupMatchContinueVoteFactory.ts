import * as GroupMatchContinueVoteRepository from "~/features/sendouq-match/GroupMatchContinueVoteRepository.server";
import { actAs } from "../core/actAs";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<
	typeof GroupMatchContinueVoteRepository.castOwnVote
>[0] & {
	/** The group member whose vote it is, on whose behalf it is cast. */
	userId: number;
};

/** Votes on carrying on after a match. A vote against clears the votes in favour, so they go through the repository in cast order. */
export const { create } = defineFactory({
	defaults: () => ({ isContinuing: true }),
	insert: ({ userId, ...args }: InsertArgs) =>
		actAs(userId, () => GroupMatchContinueVoteRepository.castOwnVote(args)),
});
