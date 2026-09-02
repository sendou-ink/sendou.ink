export const AVAILABILITY = {
	/** Granularity availability is entered and rendered at. */
	SLOT_STEP_MINUTES: 30,
	/** Players free at once for the team to be able to play. */
	DEFAULT_MIN_PLAYERS: 4,
	/** Shorter overlaps are not worth reporting as a playable window. */
	MIN_WINDOW_MINUTES: 60,
	DAY_NOTE_MAX_LENGTH: 100,
	TEAM_EVENT_NAME_MAX_LENGTH: 100,
	/** Weeks that can be filled in: the current one and the next. */
	WEEK_HORIZON: 2,
	/** Weeks whose end is further in the past than this are deleted. */
	RETENTION_MONTHS: 3,
	/** Assumed scrim length, the actual end is not in the data model. */
	SCRIM_COMMITMENT_SECONDS: 1.5 * 60 * 60,
	/** Week starts closer than this are the same week; timezones set them apart by hours, never days. */
	WEEK_MATCH_MAX_DISTANCE_SECONDS: 3.5 * 24 * 60 * 60,
	/** Left edge of the editor's clock window (14:00) — evenings are when people play. */
	TRACK_START_MINUTES: 14 * 60,
	/** Left edge of the clock window with the earlier-hours expander open (06:00). */
	TRACK_EARLIER_START_MINUTES: 6 * 60,
	/** Right edge of the clock window, reaching past midnight (02:00). */
	TRACK_END_MINUTES: 26 * 60,
	/** Right edge of the clock window with the later-hours expander open (06:00 the next day). */
	TRACK_LATER_END_MINUTES: 30 * 60,
} as const;
