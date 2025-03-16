import { assertUnreachable } from "~/utils/types";
import type { MainWeaponId, SpecialWeaponId, SubWeaponId } from "./types";

export const weaponCategories = [
	{
		name: "SHOOTERS",
		weaponIds: [
			0, 1, 10, 11, 20, 21, 30, 31, 40, 41, 45, 46, 47, 50, 51, 60, 61, 70, 71,
			80, 81, 90, 91, 100, 101, 300, 301, 310, 311, 400, 401,
		],
	},
	{
		name: "BLASTERS",
		weaponIds: [
			200, 201, 205, 210, 211, 220, 221, 230, 231, 240, 241, 250, 251, 260, 261,
		],
	},
	{
		name: "ROLLERS",
		weaponIds: [
			1000, 1001, 1010, 1011, 1015, 1020, 1021, 1030, 1031, 1040, 1041,
		],
	},
	{
		name: "BRUSHES",
		weaponIds: [1100, 1101, 1110, 1111, 1115, 1121, 1120],
	},
	{
		name: "CHARGERS",
		weaponIds: [
			2000, 2001, 2010, 2011, 2015, 2020, 2021, 2030, 2031, 2040, 2041, 2050,
			2051, 2060, 2061, 2070, 2071,
		],
	},
	{
		name: "SLOSHERS",
		weaponIds: [
			3000, 3001, 3005, 3010, 3011, 3020, 3021, 3030, 3031, 3040, 3041, 3050,
			3051,
		],
	},
	{
		name: "SPLATLINGS",
		weaponIds: [
			4000, 4001, 4010, 4011, 4015, 4020, 4021, 4030, 4031, 4040, 4041, 4050,
			4051,
		],
	},
	{
		name: "DUALIES",
		weaponIds: [
			5000, 5001, 5010, 5015, 5011, 5020, 5021, 5030, 5031, 5040, 5041, 5050,
			5051,
		],
	},
	{
		name: "BRELLAS",
		weaponIds: [6000, 6001, 6005, 6010, 6011, 6020, 6021, 6030, 6031],
	},
	{
		name: "STRINGERS",
		weaponIds: [7010, 7011, 7015, 7020, 7021, 7030, 7031],
	},
	{
		name: "SPLATANAS",
		weaponIds: [8000, 8001, 8005, 8010, 8011, 8020, 8021],
	},
] as const;

export const mainWeaponIds = weaponCategories
	.flatMap((category) => category.weaponIds)
	.sort((a, b) => a - b);

export const weaponIdToAltId = new Map<
	MainWeaponId,
	MainWeaponId | MainWeaponId[]
>([
	[40, [45, 47]],
	[41, 46],
	[200, 205],
	[1010, 1015],
	[1110, 1115],
	[2010, 2015],
	[3000, 3005],
	[4010, 4015],
	[5010, 5015],
	[6000, 6005],
	[7010, 7015],
	[8000, 8005],
]);
export const altWeaponIdToId = new Map<MainWeaponId, MainWeaponId>([
	[45, 40],
	[47, 40],
	[46, 41],
	[205, 200],
	[1015, 1010],
	[1115, 1110],
	[2015, 2010],
	[3005, 3000],
	[4015, 4010],
	[5015, 5010],
	[6005, 6000],
	[7015, 7010],
	[8005, 8000],
]);

/**
 * Converts a given weapon ID to an array containing the weapon ID and its alternate IDs. For example if you enter the ID 40 (Splattershot) it will return [40, 45, 47] (Splattershot, Hero Shot Replica, Order Shot Replica)
 */
export function weaponIdToArrayWithAlts(weaponId: MainWeaponId) {
	const altId = weaponIdToAltId.get(weaponId);
	if (altId !== undefined) {
		return [weaponId, ...(Array.isArray(altId) ? altId : [altId])];
	}

	const regularId = altWeaponIdToId.get(weaponId);
	if (regularId !== undefined) {
		const altId = weaponIdToAltId.get(regularId);
		if (altId !== undefined) {
			return [regularId, ...(Array.isArray(altId) ? altId : [altId])];
		}
	}

	return [weaponId];
}

const altWeaponIds = new Set(altWeaponIdToId.keys());
export const weaponIdIsNotAlt = (weaponId: MainWeaponId) =>
	!altWeaponIds.has(weaponId);

export const SPLAT_BOMB_ID = 0;
export const SUCTION_BOMB_ID = 1;
export const BURST_BOMB_ID = 2;
export const SPRINKLER_ID = 3;
export const SPLASH_WALL_ID = 4;
export const FIZZY_BOMB_ID = 5;
export const CURLING_BOMB_ID = 6;
export const AUTO_BOMB_ID = 7;
export const SQUID_BEAKON_ID = 8;
export const POINT_SENSOR_ID = 9;
export const INK_MINE_ID = 10;
export const TOXIC_MIST_ID = 11;
export const ANGLE_SHOOTER_ID = 12;
export const TORPEDO_ID = 13;

export const subWeaponIds = [
	SPLAT_BOMB_ID,
	SUCTION_BOMB_ID,
	BURST_BOMB_ID,
	SPRINKLER_ID,
	SPLASH_WALL_ID,
	FIZZY_BOMB_ID,
	CURLING_BOMB_ID,
	AUTO_BOMB_ID,
	SQUID_BEAKON_ID,
	POINT_SENSOR_ID,
	INK_MINE_ID,
	TOXIC_MIST_ID,
	ANGLE_SHOOTER_ID,
	TORPEDO_ID,
] as const;

export const nonBombSubWeaponIds = [
	SPRINKLER_ID,
	SPLASH_WALL_ID,
	SQUID_BEAKON_ID,
	POINT_SENSOR_ID,
	TOXIC_MIST_ID,
] as SubWeaponId[];

export const TRIZOOKA_ID = 1;
export const BIG_BUBBLER_ID = 2;
export const ZIPCASTER_ID = 3;
export const TENTA_MISSILES_ID = 4;
export const INK_STORM_ID = 5;
export const BOOYAH_BOMB_ID = 6;
export const WAVE_BREAKER_ID = 7;
export const INK_VAC_ID = 8;
export const KILLER_WAIL_ID = 9;
export const INKJET_ID = 10;
export const ULTRA_STAMP_ID = 11;
export const CRAB_TANK_ID = 12;
export const REEF_SLIDER_ID = 13;
export const TRIPLE_INKSTRIKE_ID = 14;
export const TACTICOOLER_ID = 15;
export const SUPER_CHUMP_ID = 16;
export const KRAKEN_ROYALE_ID = 17;
export const TRIPLE_SPLASHDOWN_ID = 18;
export const SPLATTERCOLOR_SCREEN_ID = 19;

export const specialWeaponIds = [
	TRIZOOKA_ID,
	BIG_BUBBLER_ID,
	ZIPCASTER_ID,
	TENTA_MISSILES_ID,
	INK_STORM_ID,
	BOOYAH_BOMB_ID,
	WAVE_BREAKER_ID,
	INK_VAC_ID,
	KILLER_WAIL_ID,
	INKJET_ID,
	ULTRA_STAMP_ID,
	CRAB_TANK_ID,
	REEF_SLIDER_ID,
	TRIPLE_INKSTRIKE_ID,
	TACTICOOLER_ID,
	SUPER_CHUMP_ID,
	KRAKEN_ROYALE_ID,
	TRIPLE_SPLASHDOWN_ID,
	SPLATTERCOLOR_SCREEN_ID,
] as const;

export const nonDamagingSpecialWeaponIds = [BIG_BUBBLER_ID, TACTICOOLER_ID];

export const exampleMainWeaponIdWithSpecialWeaponId = (
	specialWeaponId: SpecialWeaponId,
): MainWeaponId => {
	switch (specialWeaponId) {
		case TRIZOOKA_ID:
			return 40;
		case BIG_BUBBLER_ID:
			return 10;
		case ZIPCASTER_ID:
			return 8000;
		case TENTA_MISSILES_ID:
			return 1030;
		case INK_STORM_ID:
			return 3040;
		case BOOYAH_BOMB_ID:
			return 3020;
		case WAVE_BREAKER_ID:
			return 220;
		case INK_VAC_ID:
			return 2010;
		case KILLER_WAIL_ID:
			return 50;
		case INKJET_ID:
			return 3010;
		case ULTRA_STAMP_ID:
			return 4000;
		case CRAB_TANK_ID:
			return 20;
		case REEF_SLIDER_ID:
			return 5040;
		case TRIPLE_INKSTRIKE_ID:
			return 41;
		case TACTICOOLER_ID:
			return 60;
		case SUPER_CHUMP_ID:
			return 61;
		case KRAKEN_ROYALE_ID:
			return 4011;
		case TRIPLE_SPLASHDOWN_ID:
			return 211;
		case SPLATTERCOLOR_SCREEN_ID:
			return 401;
		default: {
			assertUnreachable(specialWeaponId);
		}
	}
};

export const weaponIdToBucketId = (id: MainWeaponId): number => id - (id % 10);
