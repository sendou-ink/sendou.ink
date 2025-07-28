export const ADMIN_DISCORD_ID = '79237403620945920';
export const ADMIN_ID = process.env.NODE_ENV === 'test' ? 1 : 274;

//                        Panda  Scep  Acing
export const STAFF_IDS = [11329, 9719, 9342];
export const STAFF_DISCORD_IDS = ['138757634500067328', '184478601171828737'];

export const DISCORD_ID_MIN_LENGTH = 17;

export const FRIEND_CODE_REGEXP_PATTERN = '^(SW-)?[0-9]{4}-?[0-9]{4}-?[0-9]{4}$';
export const FRIEND_CODE_REGEXP = new RegExp(FRIEND_CODE_REGEXP_PATTERN);

export const CUSTOM_CSS_VAR_COLORS = [
	'bg',
	'bg-darker',
	'bg-lighter',
	'bg-lightest',
	'text',
	'text-lighter',
	'theme',
	'theme-secondary',
	'chat'
] as const;
