export const AVAILABILITY = {
	/** Granularity availability is entered and rendered at. */
	SLOT_STEP_MINUTES: 30,
	/** How many players have to be free at once for the team to be able to play. */
	DEFAULT_MIN_PLAYERS: 4,
	/** Shorter overlaps are not worth reporting as a playable window. */
	MIN_WINDOW_MINUTES: 60,
	DAY_NOTE_MAX_LENGTH: 100,
	/** Weeks that can be filled in: the current one and the next. */
	WEEK_HORIZON: 2,
	/** Weeks whose end is further in the past than this are deleted. */
	RETENTION_MONTHS: 3,
} as const;
