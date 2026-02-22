import type { LFGGroup } from "./components/LFGGroupCard";

export function findOwnGroup(groups: LFGGroup[], userId: number) {
	return groups.find((g) => g.members.some((m) => m.id === userId)) ?? null;
}

export function survivingGroupId({
	ourGroup,
	theirGroup,
}: {
	ourGroup: LFGGroup;
	theirGroup: LFGGroup;
}) {
	if (ourGroup.tournamentTeamId && !theirGroup.tournamentTeamId) {
		return ourGroup.id;
	}
	if (!ourGroup.tournamentTeamId && theirGroup.tournamentTeamId) {
		return theirGroup.id;
	}

	return ourGroup.id;
}
