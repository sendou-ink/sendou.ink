import { USER_CARD } from "./user-card-constants";

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
