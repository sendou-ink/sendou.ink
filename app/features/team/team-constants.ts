export const TEAM = {
	NAME_MAX_LENGTH: 64,
	NAME_MIN_LENGTH: 2,
	BIO_MAX_LENGTH: 2000,
	BSKY_MAX_LENGTH: 50,
	TAG_MAX_LENGTH: 6,
	MAX_MEMBER_COUNT: 10,
	MAX_TEAM_COUNT_NON_PATRON: 2,
	MAX_TEAM_COUNT_PATRON: 5,
};

export const TEAM_MEMBER_ROLES = [
	"CAPTAIN",
	"CO_CAPTAIN",
	"FRONTLINE",
	"SLAYER",
	"SKIRMISHER",
	"SUPPORT",
	"MIDLINE",
	"BACKLINE",
	"FLEX",
	"SUB",
	"COACH",
	"CHEERLEADER",
] as const;

export type MemberRole = (typeof TEAM_MEMBER_ROLES)[number];

/** Classifies how a team member's `customRole` should be treated. */
export type MemberRoleType = "PLAYER" | "OTHER";

/** Not part of the competitive lineup; excluded when sourcing a roster (e.g. tournament registration). */
export const NON_PLAYER_TEAM_ROLES: readonly (typeof TEAM_MEMBER_ROLES)[number][] =
	["CHEERLEADER", "COACH", "SUB"];

export const CUSTOM_ROLE_MAX_LENGTH = 32;
