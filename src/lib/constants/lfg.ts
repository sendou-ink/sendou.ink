import { LFG_TYPES, type Tables } from '$lib/server/db/tables';

export const LFG = {
	MIN_TEXT_LENGTH: 1,
	MAX_TEXT_LENGTH: 2_000,
	POST_FRESHNESS_DAYS: 30 as const,
	types: LFG_TYPES
};

export const TEAM_POST_TYPES: Array<Tables['LFGPost']['type']> = [
	'TEAM_FOR_COACH',
	'TEAM_FOR_PLAYER',
	'TEAM_FOR_SCRIM'
];
