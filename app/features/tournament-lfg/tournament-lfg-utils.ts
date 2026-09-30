import type { LFGGroup } from "./components/LFGGroupCard";

export function survivingTeamId({
	ourGroup,
	theirGroup,
}: {
	ourGroup: LFGGroup;
	theirGroup: LFGGroup;
}) {
	if (!ourGroup.isPlaceholder && theirGroup.isPlaceholder) {
		return ourGroup.id;
	}
	if (ourGroup.isPlaceholder && !theirGroup.isPlaceholder) {
		return theirGroup.id;
	}

	return ourGroup.id;
}
