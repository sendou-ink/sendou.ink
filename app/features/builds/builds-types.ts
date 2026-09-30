import type { Ability, MainWeaponId } from "~/modules/in-game-lists/types";

export interface BuildWeaponWithTop500Info {
	weaponSplId: MainWeaponId;
	isTop500: number;
}

export interface AbilityCondition {
	ability: Ability;
	/** Ability points value or "has"/"doesn't have" */
	value: number | boolean;
	comparison?: "AT_LEAST" | "AT_MOST";
}
