import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import type { DamageType } from "../build-analyzer/analyzer-types";

export type DamageSourceType = "MAIN" | "SUB" | "SPECIAL";

export interface DamageSource {
	weaponSlot: number;
	sourceType: DamageSourceType;
	sourceId: MainWeaponId | SubWeaponId | SpecialWeaponId;
	damage: number;
	damageType: DamageType;
	label: string;
}

export interface DamageCombo {
	id: string;
	sources: DamageSource[];
	totalDamage: number;
	hitCount: number;
}

export interface CompositionWeapon {
	mainWeaponId: MainWeaponId;
	subWeaponId: SubWeaponId;
	specialWeaponId: SpecialWeaponId;
	damages: DamageSource[];
}
