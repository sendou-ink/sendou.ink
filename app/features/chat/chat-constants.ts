export const MESSAGE_MAX_LENGTH = 200;

/** System message types that are broadcast for their sound alone rather than persisted, mapped to the sound they play. */
export const SOUND_BY_SYSTEM_MESSAGE_TYPE = {
	NEW_GROUP: "sq_new-group",
	MATCH_STARTED: "sq_match",
	READY_CHECK_STARTED: "sq_ready-check",
	LIKE_RECEIVED: "sq_like",
} as const;
