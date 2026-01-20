import type { DamageType } from "~/features/build-analyzer/analyzer-types";
import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";

export const MAX_WEAPONS = 4;

export const MAX_DAMAGE_TYPES_PER_COMBO = 3;

export const MAX_REPEATS_PER_DAMAGE_TYPE = 2;

export const MAX_COMBOS_DISPLAYED = 50;

export const COMBO_DAMAGE_THRESHOLD = 80;

export const SUB_WEAPON_CATEGORIES: Record<SubWeaponId, SubWeaponCategory> = {
	0: "LETHAL", // Splat Bomb
	1: "LETHAL", // Suction Bomb
	2: "CHIP", // Burst Bomb
	3: "TURF", // Sprinkler
	4: "AREA_DENIAL", // Splash Wall
	5: "CHIP", // Fizzy Bomb
	6: "MOBILITY", // Curling Bomb
	7: "SEEKING", // Autobomb
	8: "MOBILITY", // Squid Beakon
	9: "TRACKING", // Point Sensor
	10: "AREA_DENIAL", // Ink Mine
	11: "AREA_DENIAL", // Toxic Mist
	12: "TRACKING", // Angle Shooter
	13: "SEEKING", // Torpedo
};

export const SPECIAL_WEAPON_CATEGORIES: Record<
	SpecialWeaponId,
	SpecialWeaponCategory
> = {
	1: "RANGED_BURST", // Trizooka
	2: "TEAM_SHIELD", // Big Bubbler
	3: "MELEE", // Zipcaster
	4: "GLOBAL_TRACKING", // Tenta Missiles
	5: "AREA_CONTROL", // Ink Storm
	6: "RANGED_BURST", // Booyah Bomb
	7: "AREA_CONTROL", // Wave Breaker
	8: "TEAM_SHIELD", // Ink Vac
	9: "GLOBAL_TRACKING", // Killer Wail 5.1
	10: "RANGED_BURST", // Inkjet
	11: "RANGED_BURST", // Ultra Stamp
	12: "RANGED_BURST", // Crab Tank
	13: "MELEE", // Reefslider
	14: "AREA_CONTROL", // Triple Inkstrike
	15: "TEAM_BUFF", // Tacticooler
	16: "AREA_CONTROL", // Super Chump
	17: "MELEE", // Kraken Royale
	18: "MELEE", // Triple Splashdown
	19: "AREA_CONTROL", // Splattercolor Screen
};

export const SUB_CATEGORY_ORDER = [
	"LETHAL",
	"CHIP",
	"SEEKING",
	"AREA_DENIAL",
	"MOBILITY",
	"TRACKING",
	"TURF",
] as const;

export const SPECIAL_CATEGORY_ORDER = [
	"MELEE",
	"RANGED_BURST",
	"GLOBAL_TRACKING",
	"AREA_CONTROL",
	"TEAM_SHIELD",
	"TEAM_BUFF",
] as const;

export type SubWeaponCategory = (typeof SUB_CATEGORY_ORDER)[number];
export type SpecialWeaponCategory = (typeof SPECIAL_CATEGORY_ORDER)[number];

interface VirtualDamageCombo {
	damageTypes: DamageType[];
	virtualType: DamageType;
}

const EXPLOSHER_ID = 3040 as MainWeaponId;

export const VIRTUAL_DAMAGE_COMBOS: Partial<
	Record<MainWeaponId, VirtualDamageCombo[]>
> = {
	[EXPLOSHER_ID]: [
		{
			damageTypes: ["DIRECT", "DISTANCE"],
			virtualType: "COMBO",
		},
	],
};
