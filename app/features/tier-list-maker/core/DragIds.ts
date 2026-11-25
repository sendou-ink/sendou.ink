/**
 * The ids drag and drop tells things apart by. Items, tier rows (dragged by their handle to
 * reorder the tiers) and the drop zones of the tiers and the pool all share one drag context,
 * so each kind gets ids of its own shape.
 */

import * as v from "valibot";
import {
	type TierListItem,
	tierListItemTypeSchema,
} from "../tier-list-maker-schemas";

const TIER_SORTABLE_ID_PREFIX = "tier-sortable:";

/** Id of the pool's drop zone, an item dropped on it going back to the pool. */
export const POOL_ID = "item-pool";

/**
 * Id of an item, unique within the tier list as duplicates of the same item differ by their
 * `nth` (`main-weapon:40`, `main-weapon:40:2`). Also its React key.
 */
export function itemId(item: TierListItem) {
	return `${item.type}:${item.id}${item.nth ? `:${item.nth}` : ""}`;
}

/** The item behind an {@link itemId}, or `null` if the id is something else (a tier, the pool). */
export function parseItemId(id: string): TierListItem | null {
	const [type, idStr, nth] = id.split(":");
	if (!v.is(tierListItemTypeSchema, type) || !idStr) return null;

	const isStringId =
		type === "mode" || type === "stage-mode" || type === "ability";

	return {
		type,
		id: isStringId ? idStr : Number(idStr),
		nth: nth ? Number(nth) : undefined,
	} as TierListItem;
}

/** Id of the tier row as a sortable, kept apart from the id of the tier's drop zone (the tier's own id). */
export function tierSortableId(tierId: string) {
	return `${TIER_SORTABLE_ID_PREFIX}${tierId}`;
}

/** Tier id behind a {@link tierSortableId}, or `null` if the id belongs to something else. */
export function tierIdFromSortableId(id: string) {
	return id.startsWith(TIER_SORTABLE_ID_PREFIX)
		? id.slice(TIER_SORTABLE_ID_PREFIX.length)
		: null;
}
