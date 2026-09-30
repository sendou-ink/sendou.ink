import type { Tables } from "~/db/tables";
import type {
	MemberRole,
	MemberRoleType,
} from "~/features/team/team-constants";
import type * as TeamRepository from "./TeamRepository.server";
import { NON_PLAYER_TEAM_ROLES, TEAM } from "./team-constants";

export function isTeamOwner({
	team,
	user,
}: {
	team: TeamRepository.findByCustomUrl;
	user?: { id: number };
}) {
	if (!user) return false;

	return team.members.some((member) => member.isOwner && member.id === user.id);
}

export function isTeamMember({
	team,
	user,
}: {
	team: TeamRepository.findByCustomUrl;
	user?: { id: number };
}) {
	if (!user) return false;

	return team.members.some((member) => member.id === user.id);
}

export function isTeamFull(team: TeamRepository.findByCustomUrl) {
	return team.members.length >= TEAM.MAX_MEMBER_COUNT;
}

export function canAddCustomizedColors(team: {
	members: { patronTier: number | null }[];
}) {
	return team.members.some(
		(member) => member.patronTier && member.patronTier >= 2,
	);
}

/** Who becomes owner after the current one leaves. */
export function resolveNewOwner(
	members: Array<{
		id: number;
		username: string;
		isOwner: number;
		isManager: number;
	}>,
) {
	const managers = members.filter((m) => m.isManager && !m.isOwner);
	if (managers.length > 0) {
		return managers.sort((a, b) => a.id - b.id)[0];
	}

	const regularMembers = members.filter((m) => !m.isOwner);
	if (regularMembers.length > 0) {
		return regularMembers.sort((a, b) => a.id - b.id)[0];
	}

	return null;
}

/**
 * Custom roles use their explicit `roleType`, predefined ones derive from {@link NON_PLAYER_TEAM_ROLES}.
 * `null` without a role (callers treat as a player).
 */
export function getMemberRoleType(member: {
	role: MemberRole | null;
	roleType: MemberRoleType | null;
}): MemberRoleType | null {
	if (member.roleType) return member.roleType;
	if (!member.role) return null;
	return NON_PLAYER_TEAM_ROLES.includes(member.role) ? "OTHER" : "PLAYER";
}

/** Participants of the result who were neither a current member nor a member at the time of the result. */
export function subsOfResult<T extends { id: number }>(
	result: { participants: Array<T>; startsAt: number },
	members: Array<Pick<Tables["TeamMember"], "userId" | "createdAt" | "leftAt">>,
) {
	const currentMembers = members.filter((member) => !member.leftAt);
	const pastMembers = members.filter((member) => member.leftAt);

	const subs = result.participants.reduce((acc: Array<T>, cur) => {
		if (currentMembers.some((member) => member.userId === cur.id)) return acc;
		if (
			pastMembers.some(
				(member) =>
					member.userId === cur.id &&
					member.createdAt < result.startsAt &&
					member.leftAt &&
					member.leftAt > result.startsAt,
			)
		) {
			return acc;
		}

		acc.push(cur);

		return acc;
	}, []);

	return subs;
}
