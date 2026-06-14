import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";

export interface WeaponKitInfo {
	weaponId: MainWeaponId;
	subWeaponId: SubWeaponId;
	specialWeaponId: SpecialWeaponId;
}

export interface ParamValueWithHistory {
	current: number | string;
	history: Array<{ version: string; value: number | string }>;
}

export interface ParsedWeaponParams {
	weaponId: MainWeaponId;
	categories: Record<string, Record<string, ParamValueWithHistory>>;
}

export interface ParamDefinition {
	category: string;
	key: string;
	fullKey: string;
}

export interface WeaponParamsTableProps {
	currentWeaponId: MainWeaponId;
	categoryWeaponIds: MainWeaponId[];
	weaponParams: Record<string, ParsedWeaponParams>;
	versions: string[];
}
