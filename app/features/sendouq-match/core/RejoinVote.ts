import type { SQMatch } from "~/features/sendouq/core/SendouQ.server";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import * as SendouQMatch from "./SendouQMatch";

export interface RejoinVote {
	userId: number;
	isContinuing: boolean;
}

const MIN_CONTINUING_GROUP_SIZE = 2;

/** ONGOING until every member of a full group has voted, then RESOLVED with the ids continuing, or FAILED if too few to form a viable group. */
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

/** The user's vote, or null if they have not voted. */
export function userContinueStatus(votes: RejoinVote[], userId: number) {
	return votes.find((vote) => vote.userId === userId)?.isContinuing ?? null;
}

/** Whether the user may still cast `isContinuing`: a first vote while ongoing, or changing a yes to a no; a no is final. */
export function canCastVote(
	votes: RejoinVote[],
	userId: number,
	isContinuing: boolean,
) {
	if (result(votes).type !== "ONGOING") return false;

	const currentVote = userContinueStatus(votes, userId);
	if (currentVote === null) return true;

	return currentVote && !isContinuing;
}

/** Votes cast within the viewer's own group, or null if they are in neither side of the match. */
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

/** Group member ids minus anyone who voted against continuing. */
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
