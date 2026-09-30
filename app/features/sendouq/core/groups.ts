import type { Tables } from "~/db/tables";
import { databaseTimestampToDate } from "~/utils/dates";
import type { GroupExpiryStatus } from "../q-types";
import type { SQGroup } from "./SendouQ.server";

// group expires in 30min without actions performed
const GROUP_EXPIRES_IN_MS = 30 * 60 * 1000;
const GROUP_EXPIRING_SOON_IN_MS = 10 * 60 * 1000;

/** Whose settings two morphing groups keep: the bigger group's, or at equal size the liked group's. */
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

export function isInLookingPool(group: {
	status: Tables["Group"]["status"];
	matchId: number | null;
}) {
	return group.status === "ACTIVE" && !group.matchId;
}

/** Whether members can suggest groups to each other; a solo group has no one to point at anything. */
export function canSuggest(group: { members: unknown[] }) {
	return group.members.length > 1;
}

/** When the group falls out of the looking pool unless an action refreshes it. */
export function groupExpiresAt(latestActionAt: number) {
	return new Date(
		databaseTimestampToDate(latestActionAt).getTime() + GROUP_EXPIRES_IN_MS,
	);
}

export function groupExpiryStatus(
	latestActionAt: number,
): GroupExpiryStatus | null {
	const expiresAt = groupExpiresAt(latestActionAt).getTime();

	const now = Date.now();

	if (now > expiresAt) {
		return "EXPIRED";
	}

	if (now + GROUP_EXPIRING_SOON_IN_MS > expiresAt) {
		return "EXPIRING_SOON";
	}

	return null;
}
