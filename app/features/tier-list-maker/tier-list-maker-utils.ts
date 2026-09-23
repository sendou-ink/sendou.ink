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

const TIER_SORTABLE_ID_PREFIX = "tier-sortable:";

/** Id of the tier row as a sortable, kept apart from the tier's own item drop zone id. */
export function tierSortableId(tierId: string) {
	return `${TIER_SORTABLE_ID_PREFIX}${tierId}`;
}

/** Tier id behind a sortable id, or `null` if the id belongs to something else being dragged. */
export function tierIdFromSortableId(id: string) {
	return id.startsWith(TIER_SORTABLE_ID_PREFIX)
		? id.slice(TIER_SORTABLE_ID_PREFIX.length)
		: null;
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

export function tierListSearchParamsHaveItems(searchParams: string) {
	const { state } = tierListMakerSearchParams.parse(
		new URLSearchParams(searchParams),
	);

	return Array.from(state.tierItems.values()).some((items) => items.length > 0);
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

const LIGHT_COLOR_LUMINANCE_THRESHOLD = 0.5;

/** Whether dark text/icons read better on the given `#rgb` or `#rrggbb` color than light ones. */
export function isLightColor(hex: string) {
	const channels = hexChannels(hex);
	if (!channels) return false;

	const [r, g, b] = channels;
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

	return luminance > LIGHT_COLOR_LUMINANCE_THRESHOLD;
}

/** Text color that stays readable on a tier's `#rgb` or `#rrggbb` background color. */
export function tierTextColor(hex: string) {
	return isLightColor(hex)
		? "var(--color-text-on-light)"
		: "var(--color-text-on-dark)";
}

function hexChannels(hex: string) {
	const digits = hex.replace("#", "");
	const channels =
		digits.length === 3
			? digits.split("").map((digit) => `${digit}${digit}`)
			: digits.match(/.{2}/g);

	if (!channels || channels.length < 3) return null;

	const parsed = channels
		.slice(0, 3)
		.map((channel) => Number.parseInt(channel, 16));

	return parsed.some(Number.isNaN) ? null : parsed;
}
