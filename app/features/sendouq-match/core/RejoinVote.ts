import type { SQMatch } from "~/features/sendouq/core/SendouQ.server";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import * as SendouQMatch from "./SendouQMatch";

export interface RejoinVote {
	userId: number;
	isContinuing: boolean;
}

const MIN_CONTINUING_GROUP_SIZE = 2;

/**
 * Resolves the overall vote state. ONGOING until every member of a full group
 * has cast a vote, then RESOLVED with the ids of those who chose to continue,
 * or FAILED if too few want to continue to form a viable group.
 */
export function result(votes: RejoinVote[]) {
	if (votes.length !== FULL_GROUP_SIZE) {
		return { type: "ONGOING" as const };
	}

	const continuingUserIds = votes
		.filter((vote) => vote.isContinuing)
		.map((vote) => vote.userId);

	if (continuingUserIds.length < MIN_CONTINUING_GROUP_SIZE) {
		return { type: "FAILED" as const };
	}

	return {
		type: "RESOLVED" as const,
		continuingUserIds,
	};
}

/**
 * Returns the given user's vote (true/false), or null if they have not voted.
 */
export function userContinueStatus(votes: RejoinVote[], userId: number) {
	return votes.find((vote) => vote.userId === userId)?.isContinuing ?? null;
}

/**
 * Whether the given user is still eligible to cast their vote.
 */
export function canCastVote(votes: RejoinVote[], userId: number) {
	return !votes.some((vote) => vote.userId === userId);
}

/**
 * Collects the votes cast within the viewing user's own group. Returns null if
 * the user is not a member of either side of the match.
 */
export function extractOwnGroupVotesFromSendouqMatch(
	match: Pick<SQMatch, "groupAlpha" | "groupBravo">,
	userId: number,
): RejoinVote[] | null {
	const ownSide = SendouQMatch.resolveGroupMemberOf({
		groupAlpha: match.groupAlpha,
		groupBravo: match.groupBravo,
		userId,
	});
	const ownGroup =
		ownSide === "ALPHA"
			? match.groupAlpha
			: ownSide === "BRAVO"
				? match.groupBravo
				: null;

	if (!ownGroup) return null;

	return ownGroup.members.flatMap((member) =>
		typeof member.isContinuing === "boolean"
			? {
					userId: member.id,
					isContinuing: member.isContinuing,
				}
			: [],
	);
}

/**
 * Returns the group member ids that remain after removing anyone who voted
 * against continuing.
 */
export function currentUserIds(
	votes: RejoinVote[],
	groupMemberIds: number[],
): number[] {
	const dropped = new Set(droppedUserIds(votes));
	return groupMemberIds.filter((id) => !dropped.has(id));
}

function droppedUserIds(votes: RejoinVote[]): number[] {
	return votes.filter((v) => !v.isContinuing).map((v) => v.userId);
}
