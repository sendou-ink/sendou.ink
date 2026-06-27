import type { TierListItem, TierListState } from "./tier-list-maker-schemas";

export function tierListItemId(item: TierListItem) {
	return `${item.type}:${item.id}${item.nth ? `:${item.nth}` : ""}`;
}

/**
 * Returns a new tier list state with the given item appended to the end of the
 * specified tier. Used by the "click" placement mode. If the tier does not
 * exist the state is returned unchanged.
 */
export function addItemToTier(
	state: TierListState,
	tierId: string,
	item: TierListItem,
): TierListState {
	if (!state.tiers.some((tier) => tier.id === tierId)) {
		return state;
	}

	const newTierItems = new Map(state.tierItems);
	const tierItems = newTierItems.get(tierId) ?? [];
	newTierItems.set(tierId, [...tierItems, item]);

	return {
		...state,
		tierItems: newTierItems,
	};
}

/**
 * Finds the next nth value for a duplicate item in the tier list.
 * Searches through all tiers to find the maximum nth value for items
 * with the same id and type, then returns max + 1.
 */
export function getNextNthForItem(
	item: TierListItem,
	tiers: TierListState,
): number {
	return (
		Array.from(tiers.tierItems.values()).reduce((maxNth, items) => {
			const matchingItems = items.filter(
				(i) => i.id === item.id && i.type === item.type,
			);
			const currentMax = Math.max(
				...matchingItems.map((i) => i.nth ?? 0),
				maxNth,
			);
			return currentMax;
		}, 0) + 1
	);
}
