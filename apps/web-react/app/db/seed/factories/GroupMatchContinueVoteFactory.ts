import * as GroupMatchContinueVoteRepository from "~/features/sendouq-match/GroupMatchContinueVoteRepository.server";
import { actAs } from "../core/actAs";
import { defineFactory } from "../core/defineFactory";

type InsertArgs = Parameters<
	typeof GroupMatchContinueVoteRepository.castOwnVote
>[0] & {
	/** The group member whose vote it is, on whose behalf it is cast. */
	userId: number;
};

/**
 * Creates the votes a SendouQ group casts on carrying on with the same teammates
 * after a match. A vote against clears the group's votes in favour, since those
 * were for carrying on at a size the group no longer has — the repository's own
 * doing, which is why the votes go through it in the order they were cast.
 */
export const { create } = defineFactory({
	defaults: () => ({ isContinuing: true }),
	insert: ({ userId, ...args }: InsertArgs) =>
		actAs(userId, () => GroupMatchContinueVoteRepository.castOwnVote(args)),
});
