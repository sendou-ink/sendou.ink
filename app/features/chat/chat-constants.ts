export const MESSAGE_MAX_LENGTH = 200;

/** System message types that are broadcast for the moment they mark rather than persisted, and so must land unthrottled. */
export const UNTHROTTLED_SYSTEM_MESSAGE_TYPES = [
	"MATCH_STARTED",
	"READY_CHECK_STARTED",
	"LIKE_RECEIVED",
] as const;
