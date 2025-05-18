import type { DamageType } from "../build-analyzer";
import type { DAMAGE_RECEIVERS } from "./calculator-constants";

export type DamageReceiver = (typeof DAMAGE_RECEIVERS)[number];

export type HitPoints = Record<DamageReceiver, number>;

export interface CombineWith {
	when: DamageType;
	combineWith: DamageType;
	/** for this weapon "when" damage already includes "combineWith" damage, so calculating multiplier only */
	multiplierOnly?: boolean;
}
