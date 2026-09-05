import { TIER_LIST_MAKER_URL } from "~/utils/urls";
import {
	TIER_NAME_FONT_SIZE_BREAKPOINTS,
	TIER_NAME_FONT_SIZE_MIN,
} from "./tier-list-maker-constants";
import type { TierListItem, TierListState } from "./tier-list-maker-schemas";
import { tierListMakerSearchParams } from "./tier-list-maker-search-params";

export function tierListItemId(item: TierListItem) {
	return `${item.type}:${item.id}${item.nth ? `:${item.nth}` : ""}`;
}

/** Path that reopens the given tier list, used by the exported image's QR code. */
export function tierListMakerPathWithState({
	state,
	title,
	showTierHeaders,
}: {
	state: TierListState;
	title: string;
	showTierHeaders: boolean;
}) {
	return tierListMakerSearchParams.href(TIER_LIST_MAKER_URL, {
		state,
		title,
		showTierHeaders,
	});
}

/** State with the item appended to the tier; unchanged if the tier does not exist. */
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

/** Next `nth` for a duplicate item: max across all tiers of the same id and type, plus one. */
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

/** Longer tier names shrink to fit the fixed-width label. */
export function tierNameFontSize(name: string) {
	const length = name.length;
	for (const breakpoint of TIER_NAME_FONT_SIZE_BREAKPOINTS) {
		if (length <= breakpoint.maxLength) {
			return breakpoint.fontSize;
		}
	}
	return TIER_NAME_FONT_SIZE_MIN;
}
