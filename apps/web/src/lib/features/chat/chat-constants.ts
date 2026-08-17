export const CHAT = {
	MESSAGE_MAX_LENGTH: 200,
	/** How many of the newest messages a room snapshot carries. */
	MESSAGES_SHOWN: 100,
	/** How long after turning inactive a room stays readable & writable ("gg's window") before archiving. */
	INACTIVE_TO_ARCHIVED_HOURS: 21,
	/** How long after turning inactive a room (and its messages) is permanently deleted. */
	DELETE_AFTER_INACTIVE_DAYS: 7,
	/** A scrim's room turns inactive this long after the scrim's start time. */
	SCRIM_ROOM_INACTIVE_AFTER_START_HOURS: 3,
} as const;
