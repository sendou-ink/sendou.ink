import type { Ability, MainWeaponId } from "~/modules/in-game-lists/types";

// xxx: random interface
export interface BuildWeaponWithTop500Info {
	weaponSplId: MainWeaponId;
	isTop500: boolean;
}

export interface AbilityCondition {
	ability: Ability;
	/** Ability points value or "has"/"doesn't have" */
	value: number | boolean;
	comparison?: "AT_LEAST" | "AT_MOST";
}
