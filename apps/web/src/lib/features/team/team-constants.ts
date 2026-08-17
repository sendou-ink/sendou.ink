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

/** Roles that are not part of a team's active competitive lineup. Excluded when sourcing a roster (e.g. prefilling tournament registration or a scrim post). */
export const NON_PLAYER_TEAM_ROLES: readonly (typeof TEAM_MEMBER_ROLES)[number][] =
	["CHEERLEADER", "COACH", "SUB"];
