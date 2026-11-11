import type { Tables } from "~/db/tables";
import { databaseTimestampToDate } from "~/utils/dates";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import type { GroupExpiryStatus } from "../q-types";

// group expires in 30min without actions performed
const GROUP_EXPIRES_IN_MS =
	process.env.NODE_ENV === "development" || IS_E2E_TEST_RUN
		? 1_000_000_000
		: 30 * 60 * 1000;
const GROUP_EXPIRING_SOON_IN_MS = 10 * 60 * 1000;

/** Whose settings two morphing groups keep: the bigger group's, or at equal size ours (the liked group's). */
export function groupAfterMorph<Group extends { members: unknown[] }>({
	ourGroup,
	theirGroup,
}: {
	ourGroup: Group;
	theirGroup: Group;
}) {
	if (theirGroup.members.length > ourGroup.members.length) {
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
