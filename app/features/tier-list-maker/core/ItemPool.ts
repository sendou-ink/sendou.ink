/**
 * The pool under the tiers: the items of the chosen type (main weapons, stages…) that can still
 * be placed, after the filters of the pool are applied.
 */

import { abilitiesShort } from "~/modules/in-game-lists/abilities";
import { modesShort } from "~/modules/in-game-lists/modes";
import { stageIds } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort } from "~/modules/in-game-lists/types";
import {
	mainWeaponIds,
	specialWeaponIds,
	subWeaponIds,
	weaponIdToType,
} from "~/modules/in-game-lists/weapon-ids";
import { assertUnreachable } from "~/utils/types";
import type { TierListItem, TierListState } from "../tier-list-maker-schemas";

/**
 * Items the pool offers, in game order. An item already placed is left out, unless duplicates are
 * allowed: then it is offered again as a new copy, numbered by its `nth`. Alt kits and alt skins
 * can be hidden from the main weapons, and stage + mode pairs are only offered for the selected modes.
 */
export function items({
	state,
	type,
	canAddDuplicates,
	hideAltKits,
	hideAltSkins,
	modes,
}: {
	state: TierListState;
	type: TierListItem["type"];
	canAddDuplicates: boolean;
	hideAltKits: boolean;
	hideAltSkins: boolean;
	modes: ModeShort[];
}): TierListItem[] {
	const placedItems = new Set<string>();
	for (const tierItems of state.tierItems.values()) {
		for (const item of tierItems) {
			placedItems.add(`${item.type}:${item.id}`);
		}
	}

	return allItemIdsOfType(type, modes)
		.map((id) => ({ id, type }) as TierListItem)
		.flatMap((item) => {
			if (item.type === "main-weapon") {
				const weaponType = weaponIdToType(item.id);
				if (hideAltKits && weaponType === "ALT_KIT") return [];
				if (hideAltSkins && weaponType === "ALT_SKIN") return [];
			}

			if (!placedItems.has(`${item.type}:${item.id}`)) return item;
			if (!canAddDuplicates) return [];

			return { ...item, nth: nextNth(item, state) };
		});
}

function allItemIdsOfType(
	type: TierListItem["type"],
	modes: ModeShort[],
): Array<TierListItem["id"]> {
	switch (type) {
		case "main-weapon":
			return [...mainWeaponIds];
		case "sub-weapon":
			return [...subWeaponIds];
		case "special-weapon":
			return [...specialWeaponIds];
		case "stage":
			return [...stageIds];
		case "mode":
			return [...modesShort];
		case "ability":
			return [...abilitiesShort];
		case "stage-mode":
			return stageIds.flatMap((stageId) =>
				modesShort
					.filter((mode) => modes.includes(mode))
					.map((mode) => `${stageId}-${mode}`),
			);
		default:
			assertUnreachable(type);
	}
}

/** One more than the highest `nth` of the item's copies in any tier, the original counting as 0. */
function nextNth(item: TierListItem, state: TierListState) {
	let maxNth = 0;
	for (const tierItems of state.tierItems.values()) {
		for (const placed of tierItems) {
			if (placed.id === item.id && placed.type === item.type) {
				maxNth = Math.max(maxNth, placed.nth ?? 0);
			}
		}
	}

	return maxNth + 1;
}
