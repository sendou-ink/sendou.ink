import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import type { ParamChangeKind } from "./core/param-directions";

export interface WeaponKitInfo {
	weaponId: MainWeaponId;
	subWeaponId: SubWeaponId;
	specialWeaponId: SpecialWeaponId;
}

export interface ParamValueWithHistory {
	current: number | string;
	history: Array<{ version: string; value: number | string }>;
}

/** Which set of weapons a params page compares: main weapons, sub weapons or special weapons. */
export type WeaponParamKind = "main" | "sub" | "special";

const WEAPON_PARAM_KIND_KEY_PREFIX: Record<WeaponParamKind, string> = {
	main: "MAIN",
	sub: "SUB",
	special: "SPECIAL",
};

/** The i18next `weapons` namespace key for a weapon of the given {@link WeaponParamKind}. */
export function weaponTranslationKey(kind: WeaponParamKind, id: number) {
	return `weapons:${WEAPON_PARAM_KIND_KEY_PREFIX[kind]}_${id}`;
}

export interface ParsedWeaponParams {
	weaponId: number;
	categories: Record<string, Record<string, ParamValueWithHistory>>;
}

export interface ParamDefinition {
	category: string;
	key: string;
	fullKey: string;
}

/** A single weapon's numeric value for one parameter, used by the cross-weapon comparison chart. */
export interface ParamComparisonEntry {
	weaponId: number;
	value: number;
	name: string;
}

export interface SpecialPointWithHistory {
	weaponId: MainWeaponId;
	current: number;
	history: Array<{ version: string; value: number }>;
}

/**
 * History of a weapon's damage multiplier against a single object (a {@link DAMAGE_RECEIVERS}
 * target), surfaced only in the patch history. `target` is the receiver key used by the object
 * damage calculator.
 */
export interface DamageMultiplierWithHistory {
	target: string;
	current: number;
	history: Array<{ version: string; value: number }>;
}

export interface PatchChange {
	category: string;
	key: string;
	from: number | string;
	to: number | string;
	kind: ParamChangeKind;
	/** The specific kit a special points change belongs to. Only set for special points. */
	weaponId?: MainWeaponId;
	/**
	 * Which weapon of a kit the change belongs to. Used by the per-kit patch history to group a
	 * column's changes under a divider per weapon. Only set for kit patch histories.
	 */
	source?: WeaponParamKind;
}

export interface WeaponPatch {
	version: string;
	date: string | null;
	changes: PatchChange[];
}

/**
 * Patch history of a single main weapon kit, folding the main weapon's changes together with its
 * sub and special weapon's changes. Each {@link PatchChange} carries a `source` so the changes can
 * be grouped per weapon within a patch.
 */
export interface KitPatchHistory {
	weaponId: MainWeaponId;
	subWeaponId: SubWeaponId;
	specialWeaponId: SpecialWeaponId;
	patches: WeaponPatch[];
}

export interface WeaponParamsTableProps {
	kind: WeaponParamKind;
	currentWeaponId: number;
	categoryWeaponIds: number[];
	weaponParams: Record<string, ParsedWeaponParams>;
	/** Special points are only tracked for main weapons. */
	specialPoints?: Record<string, SpecialPointWithHistory[]>;
	/** Damage multipliers (damage rate vs objects), keyed by weapon id. */
	damageMultipliers?: Record<string, DamageMultiplierWithHistory[]>;
	versions: string[];
}
