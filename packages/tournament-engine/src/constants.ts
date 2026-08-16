/**
 * Engine-side defaults applied when a stage's settings leave a value out. The
 * app's `TOURNAMENT` constant object references these so the two can't drift.
 */
export const ENGINE_DEFAULTS = {
	RR_DEFAULT_TEAM_COUNT_PER_GROUP: 4,
	SWISS_DEFAULT_GROUP_COUNT: 1,
	SWISS_DEFAULT_ROUND_COUNT: 5,
	SE_DEFAULT_HAS_THIRD_PLACE_MATCH: true,
} as const;
