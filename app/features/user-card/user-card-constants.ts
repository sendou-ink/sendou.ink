export const USER_CARD = {
	SHORT_BIO_MAX_LENGTH: 64,
	/** Max self-reported peak XP when the user has no linked Splatoon player. */
	// xxx: explain these in a bottom txt
	MAX_UNVERIFIED_XP_WITHOUT_LINKED_PLAYER: 3000,
	/** How much higher than their verified peak XP a linked user may self-report. */
	MAX_UNVERIFIED_XP_ABOVE_LINKED_PLAYER: 250,
} as const;
