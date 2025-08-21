import type {
	AbilityWithUnknown,
	MainWeaponId,
	ModeShort,
	StageId
} from '$lib/constants/in-game/types';
import type { weaponCategories } from '$lib/constants/in-game/weapon-ids';
import { m } from '$lib/paraglide/messages';
import type { Tables } from '$lib/server/db/tables';
import { logger } from './logger';

/**
 * Returns the localized display name for a given ISO country code using the specified language. If the country code is unknown or the function fails for othe reason, returns the country code itself as a fallback.
 *
 * @example
 * ```typescript
 * function CountryNameComponent() {
 *  const { i18n } = useTranslation();
 *  const countryName = countryCodeToTranslatedName({
 *   countryCode: "FI",
 *   language: i18n.language,
 *  }); // "Suomi" in Finnish
 * }
 * ```
 */
export function countryCodeToTranslatedName({
	countryCode,
	language
}: {
	countryCode: string;
	language: string;
}) {
	// known limitation, function cannot handle e.g. GB-WLS (Wales)
	if (countryCode.includes('-')) {
		return countryCode;
	}

	try {
		return new Intl.DisplayNames([language], { type: 'region' }).of(countryCode) ?? countryCode;
	} catch (e) {
		logger.error(`Error getting display name for country code "${countryCode}":`, e);
		return countryCode; // fallback to the code itself if display name fails
	}
}

export const languages = [
	{
		code: 'da',
		name: 'Dansk'
	},
	{
		code: 'de',
		name: 'Deutsch'
	},
	{
		code: 'en',
		name: 'English'
	},
	{
		code: 'es-ES',
		name: 'Español (España)'
	},
	{
		code: 'es-US',
		name: 'Español (Latino)'
	},
	{
		code: 'fr-CA',
		name: 'Français (NoA)'
	},
	{
		code: 'fr-EU',
		name: 'Français (NoE)'
	},
	{
		code: 'he',
		name: 'עברית'
	},
	{
		code: 'it',
		name: 'Italiano'
	},
	{
		code: 'ja',
		name: '日本語'
	},
	{
		code: 'ko',
		name: '한국어'
	},
	{
		code: 'pl',
		name: 'Polski'
	},
	{
		code: 'pt-BR',
		name: 'Português do Brasil'
	},
	{
		code: 'nl',
		name: 'Nederlands'
	},
	{
		code: 'ru',
		name: 'Русский'
	},
	{
		code: 'zh',
		name: '中文'
	}
] as const;

export const languagesUnified = [
	{
		code: 'da',
		name: 'Dansk'
	},
	{
		code: 'de',
		name: 'Deutsch'
	},
	{
		code: 'en',
		name: 'English'
	},
	{
		code: 'es',
		name: 'Español'
	},
	{
		code: 'fr',
		name: 'Français'
	},
	{
		code: 'he',
		name: 'עברית'
	},
	{
		code: 'it',
		name: 'Italiano'
	},
	{
		code: 'ja',
		name: '日本語'
	},
	{
		code: 'ko',
		name: '한국어'
	},
	{
		code: 'pl',
		name: 'Polski'
	},
	{
		code: 'pt',
		name: 'Português'
	},
	{
		code: 'nl',
		name: 'Nederlands'
	},
	{
		code: 'ru',
		name: 'Русский'
	},
	{
		code: 'zh',
		name: '中文'
	}
] as const;

export type LanguageCode = (typeof languages)[number]['code'];

export const weaponCategoryTranslations: Record<
	(typeof weaponCategories)[number]['name'],
	() => string
> = {
	BLASTERS: m.common_weapon_category_BLASTERS,
	BRELLAS: m.common_weapon_category_BRELLAS,
	BRUSHES: m.common_weapon_category_BRUSHES,
	CHARGERS: m.common_weapon_category_CHARGERS,
	DUALIES: m.common_weapon_category_DUALIES,
	ROLLERS: m.common_weapon_category_ROLLERS,
	SHOOTERS: m.common_weapon_category_SHOOTERS,
	SLOSHERS: m.common_weapon_category_SLOSHERS,
	SPLATANAS: m.common_weapon_category_SPLATANAS,
	SPLATLINGS: m.common_weapon_category_SPLATLINGS,
	STRINGERS: m.common_weapon_category_STRINGERS
};

export const abilityTranslations: Record<AbilityWithUnknown, () => string> = {
	AD: m.game_misc_ABILITY_AD,
	BRU: m.game_misc_ABILITY_BRU,
	CB: m.game_misc_ABILITY_CB,
	DR: m.game_misc_ABILITY_DR,
	H: m.game_misc_ABILITY_H,
	IA: m.game_misc_ABILITY_IA,
	IRU: m.game_misc_ABILITY_IRU,
	ISM: m.game_misc_ABILITY_ISM,
	ISS: m.game_misc_ABILITY_ISS,
	LDE: m.game_misc_ABILITY_LDE,
	NS: m.game_misc_ABILITY_NS,
	OG: m.game_misc_ABILITY_OG,
	OS: m.game_misc_ABILITY_OS,
	QR: m.game_misc_ABILITY_QR,
	QSJ: m.game_misc_ABILITY_QSJ,
	RES: m.game_misc_ABILITY_RES,
	RP: m.game_misc_ABILITY_RP,
	RSU: m.game_misc_ABILITY_RSU,
	SCU: m.game_misc_ABILITY_SCU,
	SJ: m.game_misc_ABILITY_SJ,
	SPU: m.game_misc_ABILITY_SPU,
	SRU: m.game_misc_ABILITY_SRU,
	SS: m.game_misc_ABILITY_SS,
	SSU: m.game_misc_ABILITY_SSU,
	T: m.game_misc_ABILITY_T,
	TI: m.game_misc_ABILITY_TI,
	UNKNOWN: m.builds_emptyAbilitySlot
};

export const modesLongTranslations: Record<ModeShort, () => string> = {
	TW: m.game_misc_MODE_LONG_TW,
	SZ: m.game_misc_MODE_LONG_SZ,
	TC: m.game_misc_MODE_LONG_TC,
	RM: m.game_misc_MODE_LONG_RM,
	CB: m.game_misc_MODE_LONG_CB
};

export const modesShortTranslations: Record<ModeShort, () => string> = {
	TW: m.game_misc_MODE_SHORT_TW,
	SZ: m.game_misc_MODE_SHORT_SZ,
	TC: m.game_misc_MODE_SHORT_TC,
	RM: m.game_misc_MODE_SHORT_RM,
	CB: m.game_misc_MODE_SHORT_CB
};

export const stageTranslations: Record<StageId, () => string> = {
	0: m.game_misc_STAGE_0,
	1: m.game_misc_STAGE_1,
	2: m.game_misc_STAGE_2,
	3: m.game_misc_STAGE_3,
	4: m.game_misc_STAGE_4,
	5: m.game_misc_STAGE_5,
	6: m.game_misc_STAGE_6,
	7: m.game_misc_STAGE_7,
	8: m.game_misc_STAGE_8,
	9: m.game_misc_STAGE_9,
	10: m.game_misc_STAGE_10,
	11: m.game_misc_STAGE_11,
	12: m.game_misc_STAGE_12,
	13: m.game_misc_STAGE_13,
	14: m.game_misc_STAGE_14,
	15: m.game_misc_STAGE_15,
	16: m.game_misc_STAGE_16,
	17: m.game_misc_STAGE_17,
	18: m.game_misc_STAGE_18,
	19: m.game_misc_STAGE_19,
	20: m.game_misc_STAGE_20,
	21: m.game_misc_STAGE_21,
	22: m.game_misc_STAGE_22,
	23: m.game_misc_STAGE_23,
	24: m.game_misc_STAGE_24
};

export const weaponTranslations: Record<
	MainWeaponId,
	(
		inputs?: object,
		options?: {
			locale?: 'en';
		}
	) => string
> = {
	0: m.weapons_MAIN_0,
	1: m.weapons_MAIN_1,
	10: m.weapons_MAIN_10,
	11: m.weapons_MAIN_11,
	20: m.weapons_MAIN_20,
	21: m.weapons_MAIN_21,
	22: m.weapons_MAIN_22,
	30: m.weapons_MAIN_30,
	31: m.weapons_MAIN_31,
	32: m.weapons_MAIN_32,
	40: m.weapons_MAIN_40,
	41: m.weapons_MAIN_41,
	42: m.weapons_MAIN_42,
	45: m.weapons_MAIN_45,
	46: m.weapons_MAIN_46,
	47: m.weapons_MAIN_47,
	50: m.weapons_MAIN_50,
	51: m.weapons_MAIN_51,
	60: m.weapons_MAIN_60,
	61: m.weapons_MAIN_61,
	70: m.weapons_MAIN_70,
	71: m.weapons_MAIN_71,
	72: m.weapons_MAIN_72,
	80: m.weapons_MAIN_80,
	81: m.weapons_MAIN_81,
	82: m.weapons_MAIN_82,
	90: m.weapons_MAIN_90,
	91: m.weapons_MAIN_91,
	92: m.weapons_MAIN_92,
	100: m.weapons_MAIN_100,
	101: m.weapons_MAIN_101,
	200: m.weapons_MAIN_200,
	201: m.weapons_MAIN_201,
	205: m.weapons_MAIN_205,
	210: m.weapons_MAIN_210,
	211: m.weapons_MAIN_211,
	212: m.weapons_MAIN_212,
	220: m.weapons_MAIN_220,
	221: m.weapons_MAIN_221,
	230: m.weapons_MAIN_230,
	231: m.weapons_MAIN_231,
	240: m.weapons_MAIN_240,
	241: m.weapons_MAIN_241,
	250: m.weapons_MAIN_250,
	251: m.weapons_MAIN_251,
	252: m.weapons_MAIN_252,
	260: m.weapons_MAIN_260,
	261: m.weapons_MAIN_261,
	300: m.weapons_MAIN_300,
	301: m.weapons_MAIN_301,
	302: m.weapons_MAIN_302,
	310: m.weapons_MAIN_310,
	311: m.weapons_MAIN_311,
	312: m.weapons_MAIN_312,
	400: m.weapons_MAIN_400,
	401: m.weapons_MAIN_401,
	1000: m.weapons_MAIN_1000,
	1001: m.weapons_MAIN_1001,
	1002: m.weapons_MAIN_1002,
	1010: m.weapons_MAIN_1010,
	1011: m.weapons_MAIN_1011,
	1015: m.weapons_MAIN_1015,
	1020: m.weapons_MAIN_1020,
	1021: m.weapons_MAIN_1021,
	1022: m.weapons_MAIN_1022,
	1030: m.weapons_MAIN_1030,
	1031: m.weapons_MAIN_1031,
	1040: m.weapons_MAIN_1040,
	1041: m.weapons_MAIN_1041,
	1042: m.weapons_MAIN_1042,
	1100: m.weapons_MAIN_1100,
	1101: m.weapons_MAIN_1101,
	1110: m.weapons_MAIN_1110,
	1111: m.weapons_MAIN_1111,
	1112: m.weapons_MAIN_1112,
	1115: m.weapons_MAIN_1115,
	1120: m.weapons_MAIN_1120,
	1121: m.weapons_MAIN_1121,
	1122: m.weapons_MAIN_1122,
	2000: m.weapons_MAIN_2000,
	2001: m.weapons_MAIN_2001,
	2010: m.weapons_MAIN_2010,
	2011: m.weapons_MAIN_2011,
	2012: m.weapons_MAIN_2012,
	2015: m.weapons_MAIN_2015,
	2020: m.weapons_MAIN_2020,
	2021: m.weapons_MAIN_2021,
	2022: m.weapons_MAIN_2022,
	2030: m.weapons_MAIN_2030,
	2031: m.weapons_MAIN_2031,
	2040: m.weapons_MAIN_2040,
	2041: m.weapons_MAIN_2041,
	2050: m.weapons_MAIN_2050,
	2051: m.weapons_MAIN_2051,
	2060: m.weapons_MAIN_2060,
	2061: m.weapons_MAIN_2061,
	2070: m.weapons_MAIN_2070,
	2071: m.weapons_MAIN_2071,
	3000: m.weapons_MAIN_3000,
	3001: m.weapons_MAIN_3001,
	3005: m.weapons_MAIN_3005,
	3010: m.weapons_MAIN_3010,
	3011: m.weapons_MAIN_3011,
	3012: m.weapons_MAIN_3012,
	3020: m.weapons_MAIN_3020,
	3021: m.weapons_MAIN_3021,
	3030: m.weapons_MAIN_3030,
	3031: m.weapons_MAIN_3031,
	3040: m.weapons_MAIN_3040,
	3041: m.weapons_MAIN_3041,
	3050: m.weapons_MAIN_3050,
	3051: m.weapons_MAIN_3051,
	3052: m.weapons_MAIN_3052,
	4000: m.weapons_MAIN_4000,
	4001: m.weapons_MAIN_4001,
	4002: m.weapons_MAIN_4002,
	4010: m.weapons_MAIN_4010,
	4011: m.weapons_MAIN_4011,
	4015: m.weapons_MAIN_4015,
	4020: m.weapons_MAIN_4020,
	4021: m.weapons_MAIN_4021,
	4022: m.weapons_MAIN_4022,
	4030: m.weapons_MAIN_4030,
	4031: m.weapons_MAIN_4031,
	4040: m.weapons_MAIN_4040,
	4041: m.weapons_MAIN_4041,
	4050: m.weapons_MAIN_4050,
	4051: m.weapons_MAIN_4051,
	5000: m.weapons_MAIN_5000,
	5001: m.weapons_MAIN_5001,
	5002: m.weapons_MAIN_5002,
	5010: m.weapons_MAIN_5010,
	5011: m.weapons_MAIN_5011,
	5012: m.weapons_MAIN_5012,
	5015: m.weapons_MAIN_5015,
	5020: m.weapons_MAIN_5020,
	5021: m.weapons_MAIN_5021,
	5030: m.weapons_MAIN_5030,
	5031: m.weapons_MAIN_5031,
	5032: m.weapons_MAIN_5032,
	5040: m.weapons_MAIN_5040,
	5041: m.weapons_MAIN_5041,
	5050: m.weapons_MAIN_5050,
	5051: m.weapons_MAIN_5051,
	6000: m.weapons_MAIN_6000,
	6001: m.weapons_MAIN_6001,
	6005: m.weapons_MAIN_6005,
	6010: m.weapons_MAIN_6010,
	6011: m.weapons_MAIN_6011,
	6012: m.weapons_MAIN_6012,
	6020: m.weapons_MAIN_6020,
	6021: m.weapons_MAIN_6021,
	6022: m.weapons_MAIN_6022,
	6030: m.weapons_MAIN_6030,
	6031: m.weapons_MAIN_6031,
	7010: m.weapons_MAIN_7010,
	7011: m.weapons_MAIN_7011,
	7012: m.weapons_MAIN_7012,
	7015: m.weapons_MAIN_7015,
	7020: m.weapons_MAIN_7020,
	7021: m.weapons_MAIN_7021,
	7022: m.weapons_MAIN_7022,
	7030: m.weapons_MAIN_7030,
	7031: m.weapons_MAIN_7031,
	8000: m.weapons_MAIN_8000,
	8001: m.weapons_MAIN_8001,
	8002: m.weapons_MAIN_8002,
	8005: m.weapons_MAIN_8005,
	8010: m.weapons_MAIN_8010,
	8011: m.weapons_MAIN_8011,
	8012: m.weapons_MAIN_8012,
	8020: m.weapons_MAIN_8020,
	8021: m.weapons_MAIN_8021
};

export const teamRoleTranslations: Record<
	NonNullable<Tables['TeamMember']['role']>,
	() => string
> = {
	CAPTAIN: m.team_roles_CAPTAIN,
	CO_CAPTAIN: m.team_roles_CO_CAPTAIN,
	FRONTLINE: m.team_roles_FRONTLINE,
	SLAYER: m.team_roles_SLAYER,
	SKIRMISHER: m.team_roles_SKIRMISHER,
	SUPPORT: m.team_roles_SUPPORT,
	MIDLINE: m.team_roles_MIDLINE,
	BACKLINE: m.team_roles_BACKLINE,
	FLEX: m.team_roles_FLEX,
	SUB: m.team_roles_SUB,
	COACH: m.team_roles_COACH,
	CHEERLEADER: m.team_roles_CHEERLEADER
};
