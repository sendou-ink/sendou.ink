import { USER_CARD } from "./user-card-constants";

export function maxUnverifiedXp(linkedPeakXp: number | null) {
	return typeof linkedPeakXp === "number"
		? linkedPeakXp + USER_CARD.MAX_UNVERIFIED_XP_ABOVE_LINKED_PLAYER
		: USER_CARD.MAX_UNVERIFIED_XP_WITHOUT_LINKED_PLAYER;
}
