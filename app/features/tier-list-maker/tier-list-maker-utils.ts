import { deflateRaw, inflateRaw } from "pako";
import type { TierListItem, TierListState } from "./tier-list-maker-schemas";

export function tierListItemId(item: TierListItem) {
	return `${item.type}:${item.id}${item.nth ? `:${item.nth}` : ""}`;
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

export function compress<T>(obj: T) {
	const bytes = deflateRaw(JSON.stringify(obj), { level: 9 });
	let binary = "";

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

export function decompress<T>(compressed: string) {
	try {
		const base64 = compressed.replace(/-/g, "+").replace(/_/g, "/");
		const json = inflateRaw(
			Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
			{ to: "string" },
		);

		if (!json) return null;

		return JSON.parse(json) as T;
	} catch {
		return null;
	}
}
