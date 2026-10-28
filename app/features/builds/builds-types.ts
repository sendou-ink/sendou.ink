import type { Ability, MainWeaponId } from "~/modules/in-game-lists/types";

export interface BuildWeaponWithTop500Info {
	weaponSplId: MainWeaponId;
	isTop500: number;
}

/** A condition on one of the build's abilities, the AP ones only for stackable abilities. */
export type AbilityFilter =
	| { type: "HAS" | "HAS_NOT"; ability: Ability }
	| { type: "AT_LEAST" | "AT_MOST"; ability: Ability; ap: number };
