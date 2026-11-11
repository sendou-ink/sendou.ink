/**
 * Rules of an association's membership: how many a user can be in, which audiences come without joining one
 * (friends, Plus tiers) and who takes over when the admin leaves.
 */
import {
	ASSOCIATION,
	type AssociationVirtualIdentifier,
} from "../associations-constants";

const PLUS_TIER_IDENTIFIERS = ["+1", "+2", "+3"] as const;

/** How many associations a user can be a member of, the ones they made included. */
export function maxMembershipCount({ isSupporter }: { isSupporter: boolean }) {
	return isSupporter
		? ASSOCIATION.MAX_COUNT_SUPPORTER
		: ASSOCIATION.MAX_COUNT_REGULAR_USER;
}

/**
 * The audiences a user can limit content to without joining an association: their friends always, and as a
 * Plus Server member their own tier and the tiers below it (a +1 member can pick "+1", "+2" and "+3").
 */
export function virtualIdentifiersOf(
	plusTier: number | null,
): Array<AssociationVirtualIdentifier> {
	return [
		"FRIENDS",
		...(plusTier ? PLUS_TIER_IDENTIFIERS.slice(plusTier - 1) : []),
	];
}

/**
 * Who becomes the admin after the current one leaves. `null` if no manager can take over,
 * in which case the admin can't leave. Of several managers the one with the lowest user id
 * (the oldest account) is picked, same as team ownership passing on.
 */
export function resolveNewAdmin<T extends { id: number; role: string }>(
	members: Array<T>,
) {
	const managers = members.filter((member) => member.role === "MANAGER");

	return managers.sort((a, b) => a.id - b.id).at(0) ?? null;
}
