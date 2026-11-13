import type { DamageType } from "~/features/build-analyzer/analyzer-types";
import type {
	CALCULATOR_DAMAGE_TYPES,
	DAMAGE_RECEIVERS,
} from "./calculator-constants";

export type DamageReceiver = (typeof DAMAGE_RECEIVERS)[number];

export type CalculatorDamageType = (typeof CALCULATOR_DAMAGE_TYPES)[number];

export type HitPoints = Record<DamageReceiver, number>;

export interface CombineWith {
	when: DamageType;
	combineWith: DamageType;
	/** for this weapon "when" damage already includes "combineWith" damage, so calculating multiplier only */
	multiplierOnly?: boolean;
}

/** A direct hit that always sets off an explosion, offered as a separate "Combined" damage type */
export interface CombinedDamage {
	direct: DamageType;
	explosion: DamageType;
	/** bows: only a fully charged arrow explodes */
	onlyFullyChargedExplodes?: boolean;
}
