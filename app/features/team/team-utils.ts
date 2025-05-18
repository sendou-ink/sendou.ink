import type * as TeamRepository from "./TeamRepository.server";
import { TEAM } from "./team-constants";

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

export function isTeamManager({
	team,
	user,
}: {
	team: TeamRepository.findByCustomUrl;
	user?: { id: number };
}) {
	if (!user) return false;

	return team.members.some(
		(member) => (member.isManager || member.isOwner) && member.id === user.id,
	);
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

/** Returns the user who will become the new owner after old one leaves */
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
