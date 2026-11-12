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

export const LETHAL_DAMAGE = 100;

export const SUB_WEAPON_CATEGORIES: Record<SubWeaponId, SubWeaponCategory> = {
	0: "LETHAL", // Splat Bomb
	1: "LETHAL", // Suction Bomb
	2: "CHIP", // Burst Bomb
	3: "TURF", // Sprinkler
	4: "COVER", // Splash Wall
	5: "CHIP", // Fizzy Bomb
	6: "MOBILITY", // Curling Bomb
	7: "HOMING", // Autobomb
	8: "MOBILITY", // Squid Beakon
	9: "MARKING", // Point Sensor
	10: "AREA_DENIAL", // Ink Mine
	11: "AREA_DENIAL", // Toxic Mist
	12: "MARKING", // Angle Shooter
	13: "HOMING", // Torpedo
};

export const SPECIAL_WEAPON_CATEGORIES: Record<
	SpecialWeaponId,
	SpecialWeaponCategory
> = {
	1: "RANGED", // Trizooka
	2: "TEAM_SHIELD", // Big Bubbler
	3: "DIVE", // Zipcaster
	4: "LOCK_ON", // Tenta Missiles
	5: "AREA_CONTROL", // Ink Storm
	6: "RANGED", // Booyah Bomb
	7: "AREA_CONTROL", // Wave Breaker
	8: "TEAM_SHIELD", // Ink Vac
	9: "LOCK_ON", // Killer Wail 5.1
	10: "BRAWL", // Inkjet
	11: "BRAWL", // Ultra Stamp
	12: "RANGED", // Crab Tank
	13: "DIVE", // Reefslider
	14: "AREA_CONTROL", // Triple Inkstrike
	15: "TEAM_BUFF", // Tacticooler
	16: "DECOY", // Super Chump
	17: "BRAWL", // Kraken Royale
	18: "DIVE", // Triple Splashdown
	19: "AREA_CONTROL", // Splattercolor Screen
};

export const SUB_CATEGORY_ORDER = [
	"LETHAL",
	"CHIP",
	"HOMING",
	"MARKING",
	"AREA_DENIAL",
	"COVER",
	"MOBILITY",
	"TURF",
] as const;

export const SPECIAL_CATEGORY_ORDER = [
	"DIVE",
	"BRAWL",
	"RANGED",
	"LOCK_ON",
	"AREA_CONTROL",
	"DECOY",
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
