/**
 * Rules of a group in a tournament's LFG queue: who puts a registered team in it, which of two groups
 * survives their merge.
 */
import type { Tables } from "~/db/tables";

type TeamMemberRole = Tables["TournamentTeamMember"]["role"];

/**
 * Can a member of this role put their registered team in the queue? Owners and managers can. A role check as the
 * tournament's teams carry no permissions object; once in the queue, a group's `permissions` take over.
 */
export function canPutTeamInQueue(role: TeamMemberRole | null | undefined) {
	return role === "OWNER" || role === "MANAGER";
}

/**
 * The group that is kept when the accepting group (`ourGroup`) merges with the group that invited it, the
 * other one's members moving over. A registered team survives over a placeholder (a player looking on their
 * own), otherwise the accepting group does.
 */
export function survivingTeamId({
	ourGroup,
	theirGroup,
}: {
	ourGroup: { id: number; isPlaceholder: boolean };
	theirGroup: { id: number; isPlaceholder: boolean };
}) {
	if (ourGroup.isPlaceholder && !theirGroup.isPlaceholder) {
		return theirGroup.id;
	}

	return ourGroup.id;
}
