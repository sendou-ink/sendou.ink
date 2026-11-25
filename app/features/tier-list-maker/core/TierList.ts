/**
 * A tier list: its tiers top to bottom and the items placed in each. Every change returns a new
 * state and leaves the old one as is, an item not placed in any tier being in the pool.
 */

import { DEFAULT_TIERS } from "../tier-list-maker-constants";
import type {
	TierListItem,
	TierListMakerTier,
	TierListState,
} from "../tier-list-maker-schemas";

const NEW_TIER_NAME = "New";
const NEW_TIER_COLOR = "#888888";

/** The default tiers (X, S, A, B and C) with nothing placed in them. */
export function empty(): TierListState {
	return { tiers: DEFAULT_TIERS, tierItems: new Map() };
}

/** Whether any tier has an item placed in it. */
export function hasItems(state: TierListState) {
	return Array.from(state.tierItems.values()).some((items) => items.length > 0);
}

/** Id of the tier the item is placed in, `null` if it is in the pool. */
export function tierOf(state: TierListState, item: TierListItem) {
	for (const [tierId, items] of state.tierItems.entries()) {
		if (items.some((placed) => isSameItem(placed, item))) {
			return tierId;
		}
	}

	return null;
}

/** The item appended to the end of the tier; unchanged if the tier does not exist. */
export function addItem(
	state: TierListState,
	tierId: string,
	item: TierListItem,
): TierListState {
	if (!state.tiers.some((tier) => tier.id === tierId)) {
		return state;
	}

	const tierItems = new Map(state.tierItems);
	tierItems.set(tierId, [...(tierItems.get(tierId) ?? []), item]);

	return { ...state, tierItems };
}

/**
 * The item moved into a tier, in the place of `overItem` (which moves one step on) or at the end
 * when there is none. Taken from the pool or out of the tier it was in.
 */
export function moveItem(
	state: TierListState,
	{
		item,
		toTierId,
		overItem,
	}: { item: TierListItem; toTierId: string; overItem: TierListItem | null },
): TierListState {
	const tierItems = withoutItem(state.tierItems, item);
	const targetItems = [...(tierItems.get(toTierId) ?? [])];
	const overIndex = overItem
		? targetItems.findIndex((placed) => isSameItem(placed, overItem))
		: -1;

	targetItems.splice(
		overIndex === -1 ? targetItems.length : overIndex,
		0,
		item,
	);
	tierItems.set(toTierId, targetItems);

	return { ...state, tierItems };
}

/** The item moved to the place of `overItem` in the same tier; unchanged if they are in different tiers. */
export function reorderItem(
	state: TierListState,
	item: TierListItem,
	overItem: TierListItem,
): TierListState {
	const tierId = tierOf(state, item);
	if (!tierId) return state;

	const items = state.tierItems.get(tierId) ?? [];
	const oldIndex = items.findIndex((placed) => isSameItem(placed, item));
	const newIndex = items.findIndex((placed) => isSameItem(placed, overItem));
	if (newIndex === -1 || oldIndex === newIndex) return state;

	const tierItems = new Map(state.tierItems);
	tierItems.set(tierId, moveIndex(items, oldIndex, newIndex));

	return { ...state, tierItems };
}

/** The item taken out of its tier, back to the pool. */
export function removeItem(
	state: TierListState,
	item: TierListItem,
): TierListState {
	return { ...state, tierItems: withoutItem(state.tierItems, item) };
}

/** A new empty tier, named "New" and colored grey, added to the bottom. */
export function addTier(state: TierListState, tierId: string): TierListState {
	const tier: TierListMakerTier = {
		id: tierId,
		name: NEW_TIER_NAME,
		color: NEW_TIER_COLOR,
	};

	return { ...state, tiers: [...state.tiers, tier] };
}

/** The tier deleted, its items going back to the pool. */
export function removeTier(
	state: TierListState,
	tierId: string,
): TierListState {
	const tierItems = new Map(state.tierItems);
	tierItems.delete(tierId);

	return {
		tiers: state.tiers.filter((tier) => tier.id !== tierId),
		tierItems,
	};
}

/** The tier renamed and/or recolored. */
export function updateTier(
	state: TierListState,
	tierId: string,
	update: Partial<Pick<TierListMakerTier, "name" | "color">>,
): TierListState {
	return {
		...state,
		tiers: state.tiers.map((tier) =>
			tier.id === tierId ? { ...tier, ...update } : tier,
		),
	};
}

/** The tier moved to the place of `overTierId`, shifting the tiers in between; unchanged if either does not exist. */
export function moveTier(
	state: TierListState,
	tierId: string,
	overTierId: string,
): TierListState {
	const oldIndex = state.tiers.findIndex((tier) => tier.id === tierId);
	const newIndex = state.tiers.findIndex((tier) => tier.id === overTierId);
	if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
		return state;
	}

	return { ...state, tiers: moveIndex(state.tiers, oldIndex, newIndex) };
}

function moveIndex<T>(array: T[], from: number, to: number) {
	const result = [...array];
	const [moved] = result.splice(from, 1);
	result.splice(to, 0, moved);

	return result;
}

function isSameItem(a: TierListItem, b: TierListItem) {
	return a.id === b.id && a.type === b.type && a.nth === b.nth;
}

function withoutItem(
	tierItems: TierListState["tierItems"],
	item: TierListItem,
) {
	const result = new Map(tierItems);
	for (const [tierId, items] of result.entries()) {
		if (items.some((placed) => isSameItem(placed, item))) {
			result.set(
				tierId,
				items.filter((placed) => !isSameItem(placed, item)),
			);
		}
	}

	return result;
}
