export const SENDOUQ = {
	SZ_MAP_COUNT: 6,
	OTHER_MODE_MAP_COUNT: 3,
	MAX_STAGE_REPEAT_COUNT: 2,
	OWN_PUBLIC_NOTE_MAX_LENGTH: 160,
	PRIVATE_USER_NOTE_MAX_LENGTH: 280,
} as const;

export const FRIEND_CODE_REGEXP_PATTERN =
	"^(SW-)?[0-9]{4}-?[0-9]{4}-?[0-9]{4}$";
export const FRIEND_CODE_REGEXP = new RegExp(FRIEND_CODE_REGEXP_PATTERN);

export const FULL_GROUP_SIZE = 4;

export const SENDOUQ_BEST_OF = 7;

export const JOIN_CODE_SEARCH_PARAM_KEY = "join";

export const USER_SKILLS_CACHE_KEY = "user-skills";
