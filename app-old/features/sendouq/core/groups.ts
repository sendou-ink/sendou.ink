import type { GroupMember } from "~/db/types";
import type { LookingGroup } from "../q-types";

// logic is that team who is bigger decides the settings
// but if groups are the same size then the one who liked
// is basically consenting that other team's setting are used
export function groupAfterMorph({
	ourGroup,
	theirGroup,
	liker,
}: {
	ourGroup: LookingGroup;
	theirGroup: LookingGroup;
	liker: "US" | "THEM";
}) {
	const ourMembers = ourGroup.members ?? [];
	const theirMembers = theirGroup.members ?? [];

	if (ourMembers.length > theirMembers.length) {
		return ourGroup;
	}

	if (theirMembers.length > ourMembers.length) {
		return theirGroup;
	}

	if (liker === "US") {
		return theirGroup;
	}

	return ourGroup;
}

export function hasGroupManagerPerms(role: GroupMember["role"]) {
	return role === "OWNER" || role === "MANAGER";
}
