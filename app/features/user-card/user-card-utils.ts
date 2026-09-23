import { USER_CARD } from "./user-card-constants";
import type { UserCardData } from "./user-card-types";

/**
 * The claim must exceed the verified XP by no more than {@link USER_CARD.MAX_UNVERIFIED_XP_ABOVE_VERIFIED}.
 */
export function isValidUnverifiedXp({
	unverified,
	verified,
}: {
	unverified: number;
	verified: number | null;
}): boolean {
	if (verified === null) return false;

	return (
		unverified > verified &&
		unverified <= verified + USER_CARD.MAX_UNVERIFIED_XP_ABOVE_VERIFIED
	);
}

/**
 * Scores a group by the viewer's private notes on its members: -1 if any member has a negative note,
 * 1 if any has a positive one (and none negative), otherwise 0. Sort descending to float liked groups up.
 */
export function privateNoteSentimentScore(
	members: { id: number }[],
	userCards: Map<number, UserCardData>,
): number {
	let score = 0;
	for (const member of members) {
		const sentiment = userCards.get(member.id)?.privateNote?.sentiment;
		if (sentiment === "NEGATIVE") return -1;
		if (sentiment === "POSITIVE") score = 1;
	}

	return score;
}
