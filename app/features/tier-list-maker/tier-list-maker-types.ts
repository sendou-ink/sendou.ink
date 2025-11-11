import type { z } from "zod/v4";
import type {
	MainWeaponId,
	SpecialWeaponId,
	StageId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import { assertType } from "~/utils/types";
import type { tierListItemTypeSchema } from "./tier-list-maker-schemas";

export type TierListItemType = TierListItem["type"];
assertType<z.infer<typeof tierListItemTypeSchema>, TierListItemType>();

// xxx: infer from schema
export type TierListItem =
	| {
			id: MainWeaponId;
			type: "main-weapon";
	  }
	| {
			id: SubWeaponId;
			type: "sub-weapon";
	  }
	| {
			id: SpecialWeaponId;
			type: "special-weapon";
	  }
	| {
			id: StageId;
			type: "stage";
	  };

// xxx: infer from schema
export interface Tier {
	id: string;
	name: string;
	color: string;
}

// xxx: this should go to constants file
export const DEFAULT_TIERS: Tier[] = [
	{ id: "tier-x", name: "X", color: "#ff4655" },
	{ id: "tier-s", name: "S", color: "#ff8c42" },
	{ id: "tier-a", name: "A", color: "#ffd23f" },
	{ id: "tier-b", name: "B", color: "#bfe84d" },
	{ id: "tier-c", name: "C", color: "#5dbb63" },
];
