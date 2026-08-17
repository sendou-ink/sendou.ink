export const USER_CARD = {
	SHORT_BIO_MAX_LENGTH: 64,
	/**
	 * Most a self-reported unverified peak XP may exceed the user's verified X Rank XP. The claim has
	 * to be higher than the verified value, but by no more than this.
	 */
	MAX_UNVERIFIED_XP_ABOVE_VERIFIED: 200,
} as const;
