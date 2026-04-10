import type {
	Ability,
	MainWeaponId,
	ModeShort,
} from "~/modules/in-game-lists/types";

export interface BuildWeaponWithTop500Info {
	weaponSplId: MainWeaponId;
	isTop500: number;
}

export type AbilityBuildFilter = {
	type: "ability";
	ability: Ability;
	/** Ability points value or "has"/"doesn't have" */
	value: number | boolean;
	comparison?: "AT_LEAST" | "AT_MOST";
};

export type ModeBuildFilter = {
	type: "mode";
	mode: ModeShort;
};

export type DateBuildFilter = {
	type: "date";
	/** YYYY-MM-DD */
	date: string;
};

export type BuildFilter =
	| AbilityBuildFilter
	| ModeBuildFilter
	| DateBuildFilter;
