import { USER_CARD } from "./user-card-constants";

/**
 * Whether a self-reported unverified peak XP is a valid claim on top of the user's verified XP: the
 * user must have a verified XP, and the claim must be higher than it but by no more than
 * {@link USER_CARD.MAX_UNVERIFIED_XP_ABOVE_VERIFIED}. Shared by the edit action (to validate) and the
 * card query (to decide whether the value is surfaced), so both apply the exact same rule.
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
