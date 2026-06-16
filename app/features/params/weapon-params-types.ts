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

export interface ParsedWeaponParams {
	weaponId: number;
	categories: Record<string, Record<string, ParamValueWithHistory>>;
}

export interface ParamDefinition {
	category: string;
	key: string;
	fullKey: string;
}

export interface SpecialPointWithHistory {
	weaponId: MainWeaponId;
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
}

export interface WeaponPatch {
	version: string;
	date: string | null;
	changes: PatchChange[];
}

export interface WeaponParamsTableProps {
	kind: WeaponParamKind;
	currentWeaponId: number;
	categoryWeaponIds: number[];
	weaponParams: Record<string, ParsedWeaponParams>;
	/** Special points are only tracked for main weapons. */
	specialPoints?: Record<string, SpecialPointWithHistory[]>;
	versions: string[];
}
