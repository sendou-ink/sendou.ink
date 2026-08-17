import {
	type MemberRole,
	type MemberRoleType,
	NON_PLAYER_TEAM_ROLES,
} from "./team-constants.ts";

/**
 * Resolves how a team member's role should be classified. For custom roles the explicit
 * `roleType` is authoritative; for predefined roles it is derived from {@link NON_PLAYER_TEAM_ROLES}.
 * Returns `null` when the member has no role at all (treated as a player by callers).
 */
export function getMemberRoleType(member: {
	role: MemberRole | null;
	roleType: MemberRoleType | null;
}): MemberRoleType | null {
	if (member.roleType) return member.roleType;
	if (!member.role) return null;
	return NON_PLAYER_TEAM_ROLES.includes(member.role) ? "OTHER" : "PLAYER";
}
