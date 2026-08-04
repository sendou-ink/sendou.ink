/** Who picks or bans in a custom pick/ban flow step. */
export const WHO_SIDES = [
	"RANDOM",
	"RANDOM_OTHER",
	"ALPHA",
	"BRAVO",
	"HIGHER_SEED",
	"LOWER_SEED",
	"WINNER",
	"LOSER",
] as const;

export type WhoSide = (typeof WHO_SIDES)[number];

/** What happens in a custom pick/ban flow step. */
export const ACTION_TYPES = [
	"ROLL",
	"PICK",
	"PICK_NO_MODE_REPEAT",
	"BAN",
	"MODE_PICK",
	"MODE_BAN",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];
