import type { SQMatch } from "~/features/sendouq/core/SendouQ.server";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";

export interface RejoinVote {
	userId: number;
	isContinuing: boolean;
}

/**
 * Resolves the overall vote state. ONGOING until every member of a full
 * group has cast a vote, then returns the ids of those who chose to continue.
 */
// xxx: what about FAILED?
export function result(votes: RejoinVote[]) {
	if (votes.length !== FULL_GROUP_SIZE) {
		return { type: "ONGOING" as const };
	}

	const willContinue = votes.filter((vote) => vote.isContinuing);

	return {
		type: "RESOLVED" as const,
		continuingUserIds: willContinue.map((vote) => vote.userId),
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
	const ownGroup = match.groupAlpha.members.some(
		(member) => member.id === userId,
	)
		? match.groupAlpha
		: match.groupBravo.members.some((member) => member.id === userId)
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
// xxx: or just reuse result?
export function currentUserIds(
	votes: RejoinVote[],
	groupMemberIds: number[],
): number[] {
	const dropped = new Set(droppedUserIds(votes));
	return groupMemberIds.filter((id) => !dropped.has(id));
}

function droppedUserIds(votes: RejoinVote[]): number[] {
	return votes.filter((v) => v.isContinuing === false).map((v) => v.userId);
}
