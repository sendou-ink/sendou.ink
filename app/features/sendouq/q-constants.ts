import { CHANNEL_PREFIX } from "~/features/events/events-types";

export const SENDOUQ = {
	SZ_MAP_COUNT: 6,
	OTHER_MODE_MAP_COUNT: 3,
	MAX_STAGE_REPEAT_COUNT: 2,
	OWN_PUBLIC_NOTE_MAX_LENGTH: 160,
	PRIVATE_USER_NOTE_MAX_LENGTH: 280,
	CANCEL_REASON_MAX_LENGTH: 500,
	/** How long the members of two matched up groups have to confirm they are ready to play */
	READY_CHECK_MINUTES: 7,
} as const;

const FRIEND_CODE_REGEXP_PATTERN = "^(SW-)?[0-9]{4}-?[0-9]{4}-?[0-9]{4}$";
export const FRIEND_CODE_REGEXP = new RegExp(FRIEND_CODE_REGEXP_PATTERN);

/** Length of a friend code with the optional "SW-" prefix included */
export const FRIEND_CODE_MAX_LENGTH = 17;

export const FULL_GROUP_SIZE = 4;

export const SENDOUQ_BEST_OF = 7;

export const ACTION_TAB_AFTER_LOCKED_SECONDS = 24 * 60 * 60; // 24 hours

/** Event bus channel that every user on the looking page subscribes to. */
export const SENDOUQ_LOOKING_CHANNEL = "sq-looking";

/** Event bus channel for revalidation messages targeted at a single group (e.g. a received like) */
export const sqGroupChannel = (groupId: number) =>
	`${CHANNEL_PREFIX.sqGroup}${groupId}`;

export const USER_SKILLS_CACHE_KEY = "user-skills";

/** Main container width (px) below which the 3-column layout switches to tabs */
export const IS_Q_LOOKING_MOBILE_BREAKPOINT = 700;
