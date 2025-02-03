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
