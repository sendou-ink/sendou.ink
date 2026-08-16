import type { MainWeaponId } from "@sendou/in-game-lists/types";
import type { DamageType } from "~/features/build-analyzer/analyzer-types";

export type CategorizationType = "category" | "sub" | "special";

export interface DamageSegment {
	weaponSlot: number;
	weaponId: MainWeaponId;
	damageType: DamageType;
	damageValue: number;
	isSubWeapon: boolean;
	isSpecialWeapon: boolean;
	count: number;
}

export interface DamageCombo {
	segments: DamageSegment[];
	totalDamage: number;
	hitCount: number;
}

export interface WeaponDamageSource {
	weaponSlot: number;
	weaponId: MainWeaponId;
	damages: Array<{
		type: DamageType;
		value: number;
		weaponType: "MAIN" | "SUB" | "SPECIAL";
	}>;
}
