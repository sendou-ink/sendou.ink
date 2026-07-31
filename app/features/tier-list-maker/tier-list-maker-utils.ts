import { compressToBase64, decompressFromBase64 } from "~/utils/compression";
import { TIER_LIST_MAKER_URL } from "~/utils/urls";
import {
	TIER_LIST_SEARCH_PARAM_NAMES,
	TIER_NAME_FONT_SIZE_BREAKPOINTS,
	TIER_NAME_FONT_SIZE_MIN,
} from "./tier-list-maker-constants";
import type { TierListItem, TierListState } from "./tier-list-maker-schemas";

export function tierListItemId(item: TierListItem) {
	return `${item.type}:${item.id}${item.nth ? `:${item.nth}` : ""}`;
}

/** Compressed representation of the tier list, as stored in the page's search params. */
export function serializeTierListState(state: TierListState) {
	return compress({
		tiers: state.tiers,
		tierItems: Array.from(state.tierItems.entries()),
	});
}

/**
 * Path to the tier list maker page that opens the given tier list as it was made,
 * used by the exported image's QR code.
 */
export function tierListMakerPathWithState({
	state,
	title,
	showTierHeaders,
}: {
	state: TierListState;
	title: string;
	showTierHeaders: boolean;
}) {
	const searchParams = new URLSearchParams({
		[TIER_LIST_SEARCH_PARAM_NAMES.STATE]: serializeTierListState(state),
	});

	if (title) {
		searchParams.set(TIER_LIST_SEARCH_PARAM_NAMES.TITLE, title);
	}
	if (!showTierHeaders) {
		searchParams.set(
			TIER_LIST_SEARCH_PARAM_NAMES.SHOW_TIER_HEADERS,
			String(showTierHeaders),
		);
	}

	return `${TIER_LIST_MAKER_URL}?${searchParams}`;
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

/**
 * Resolves the font size for a tier label so that longer tier names
 * shrink to fit inside the fixed-width label.
 */
export function tierNameFontSize(name: string) {
	const length = name.length;
	for (const breakpoint of TIER_NAME_FONT_SIZE_BREAKPOINTS) {
		if (length <= breakpoint.maxLength) {
			return breakpoint.fontSize;
		}
	}
	return TIER_NAME_FONT_SIZE_MIN;
}

/** Reverses {@link serializeTierListState}, returning null if the input is not valid. */
export function decompress<T>(compressed: string) {
	const json = decompressFromBase64(compressed);
	if (json === null) return null;

	try {
		return JSON.parse(json) as T;
	} catch {
		return null;
	}
}

function compress<T>(obj: T) {
	return compressToBase64(JSON.stringify(obj), { urlSafe: true });
}
