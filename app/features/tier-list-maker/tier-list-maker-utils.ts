import type { TierListItem, TierListState } from "./tier-list-maker-schemas";

export function tierListItemId(item: TierListItem) {
	return `${item.type}:${item.id}${item.nth ? `:${item.nth}` : ""}`;
}

export function parseItemFromId(id: string): TierListItem | null {
	const [type, idStr, nth] = String(id).split(":");
	if (!type || !idStr) return null;

	if (type === "mode" || type === "stage-mode") {
		return {
			type: type as TierListItem["type"],
			id: idStr,
			nth: nth ? Number(nth) : undefined,
		} as TierListItem;
	}

	return {
		type: type as TierListItem["type"],
		id: Number(idStr),
		nth: nth ? Number(nth) : undefined,
	} as TierListItem;
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
