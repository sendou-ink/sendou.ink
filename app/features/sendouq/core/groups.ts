import type { Tables } from "~/db/tables";
import { databaseTimestampToDate } from "~/utils/dates";
import type { GroupExpiryStatus } from "../q-types";
import type { SQGroup } from "./SQManager.server";

// logic is that team who is bigger decides the settings
// but if groups are the same size then the one who liked
// is basically consenting that other team's setting are used
export function groupAfterMorph({
	ourGroup,
	theirGroup,
	liker,
}: {
	ourGroup: SQGroup;
	theirGroup: SQGroup;
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

// xxx: delete
export function hasGroupManagerPerms(role: Tables["GroupMember"]["role"]) {
	return role === "OWNER" || role === "MANAGER";
}

export function groupExpiryStatus(
	latestActionAt: number,
): GroupExpiryStatus | null {
	// group expires in 30min without actions performed
	const groupExpiresAt =
		databaseTimestampToDate(latestActionAt).getTime() + 30 * 60 * 1000;

	const now = Date.now();

	if (now > groupExpiresAt) {
		return "EXPIRED";
	}

	const tenMinutesFromNow = now + 10 * 60 * 1000;

	if (tenMinutesFromNow > groupExpiresAt) {
		return "EXPIRING_SOON";
	}

	return null;
}
