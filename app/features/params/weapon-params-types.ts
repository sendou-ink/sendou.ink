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

/** Damage multiplier history against one object; `target` is a {@link DAMAGE_RECEIVERS} key. Patch history only. */
export interface DamageMultiplierWithHistory {
	target: string;
	current: number;
	history: Array<{ version: string; value: number }>;
}

/** Weapons whose damage rate against an object changed together, so the {@link PatchChange} badge can show their icons. */
export interface IncomingDamageAttackers {
	mainWeaponIds: MainWeaponId[];
	subWeaponIds: SubWeaponId[];
	specialWeaponIds: SpecialWeaponId[];
}

/** {@link DamageMultiplierWithHistory} from the defender's perspective: the page's sub/special is the object damaged. */
export interface IncomingDamageMultiplierWithHistory {
	target: string;
	attackers: IncomingDamageAttackers;
	current: number;
	history: Array<{ version: string; value: number }>;
}

export interface PatchChange {
	category: string;
	key: string;
	from: number | string;
	to: number | string;
	kind: ParamChangeKind;
	/** Only set for special points changes. */
	weaponId?: MainWeaponId;
	/** Which weapon of the kit the change belongs to. Only set for kit patch histories. */
	source?: WeaponParamKind;
	/** Only set for incoming damage multiplier changes. */
	attackers?: IncomingDamageAttackers;
}

export interface WeaponPatch {
	version: string;
	date: string | null;
	changes: PatchChange[];
}

/** Patch history of one kit: main + sub + special changes, each {@link PatchChange} tagged with its `source`. */
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
