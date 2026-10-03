export const MESSAGE_MAX_LENGTH = 200;
/** Encoded mentions take up a lot of characters so they're not counted towards the 200 max length,
 *  which means we need a separate max length for the entire message including characters not added by the user
 */
export const MESSAGE_MAX_RAW_LENGTH = 2_000;

/** System message types that are broadcast for the moment they mark rather than persisted, and so must land unthrottled. */
export const UNTHROTTLED_SYSTEM_MESSAGE_TYPES = [
	"MATCH_STARTED",
	"READY_CHECK_STARTED",
	"LIKE_RECEIVED",
] as const;
