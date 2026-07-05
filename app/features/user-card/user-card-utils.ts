import type { XRankPlacementRegion } from "~/db/tables";
import { USER_CARD } from "./user-card-constants";

/**
 * Highest self-reported peak XP accepted for the given division. A user with a
 * linked, verified Splatoon player is allowed a higher cap than one without.
 */
export function maxUnverifiedXp({
	division,
	hasLinkedPlayer,
}: {
	division: XRankPlacementRegion;
	hasLinkedPlayer: boolean;
}) {
	const base = USER_CARD.MAX_UNVERIFIED_XP_BY_DIVISION[division];
	return hasLinkedPlayer
		? base + USER_CARD.MAX_UNVERIFIED_XP_LINKED_PLAYER_BONUS
		: base;
}
