export const USER_CARD = {
	SHORT_BIO_MAX_LENGTH: 64,
	/**
	 * Highest self-reported peak XP accepted for a user with no linked, verified
	 * Splatoon player. The Takoroka (JPN) division has a higher ceiling than
	 * Tentatek (WEST).
	 */
	MAX_UNVERIFIED_XP_BY_DIVISION: {
		WEST: 2200,
		JPN: 2700,
	},
	/**
	 * Extra peak XP a user with a linked, verified Splatoon player may self-report
	 * on top of their division's cap.
	 */
	MAX_UNVERIFIED_XP_LINKED_PLAYER_BONUS: 200,
} as const;
