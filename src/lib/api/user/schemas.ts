import { m } from '$lib/paraglide/messages';
import {
	actualNumber,
	checkboxValueToDbBoolean,
	customCssVarObject,
	dbBoolean,
	emptyArrayToNull,
	falsyToNull,
	id,
	processMany,
	safeJSONParse,
	safeNullableStringSchema,
	undefinedToNull,
	weaponSplId
} from '$lib/schemas';
import { isCustomUrl } from '$lib/utils/urls';
import z from 'zod';
import * as Fields from '$lib/form/fields';

const CUSTOM_URL_MAX_LENGTH = 32;

export const SMALL_BADGES_PER_DISPLAY_PAGE = 9;

export const identifier = z.string().min(1).max(CUSTOM_URL_MAX_LENGTH).toLowerCase().trim();

/**
 * An array of ISO 3166-1 alpha-2 country codes.
 * Each entry is a two-letter uppercase string representing a country or territory. Sorted alphabetically.
 *
 * @see {@link https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2}
 * @see {@link https://github.com/annexare/Countries}
 */
export const COUNTRY_CODES = [
	'AD',
	'AE',
	'AF',
	'AG',
	'AI',
	'AL',
	'AM',
	'AO',
	'AQ',
	'AR',
	'AS',
	'AT',
	'AU',
	'AW',
	'AX',
	'AZ',
	'BA',
	'BB',
	'BD',
	'BE',
	'BF',
	'BG',
	'BH',
	'BI',
	'BJ',
	'BL',
	'BM',
	'BN',
	'BO',
	'BQ',
	'BR',
	'BS',
	'BT',
	'BV',
	'BW',
	'BY',
	'BZ',
	'CA',
	'CC',
	'CD',
	'CF',
	'CG',
	'CH',
	'CI',
	'CK',
	'CL',
	'CM',
	'CN',
	'CO',
	'CR',
	'CU',
	'CV',
	'CW',
	'CX',
	'CY',
	'CZ',
	'DE',
	'DJ',
	'DK',
	'DM',
	'DO',
	'DZ',
	'EC',
	'EE',
	'EG',
	'EH',
	'ER',
	'ES',
	'ET',
	'FI',
	'FJ',
	'FK',
	'FM',
	'FO',
	'FR',
	'GA',
	'GB',
	'GD',
	'GE',
	'GF',
	'GG',
	'GH',
	'GI',
	'GL',
	'GM',
	'GN',
	'GP',
	'GQ',
	'GR',
	'GS',
	'GT',
	'GU',
	'GW',
	'GY',
	'HK',
	'HM',
	'HN',
	'HR',
	'HT',
	'HU',
	'ID',
	'IE',
	'IL',
	'IM',
	'IN',
	'IO',
	'IQ',
	'IR',
	'IS',
	'IT',
	'JE',
	'JM',
	'JO',
	'JP',
	'KE',
	'KG',
	'KH',
	'KI',
	'KM',
	'KN',
	'KP',
	'KR',
	'KW',
	'KY',
	'KZ',
	'LA',
	'LB',
	'LC',
	'LI',
	'LK',
	'LR',
	'LS',
	'LT',
	'LU',
	'LV',
	'LY',
	'MA',
	'MC',
	'MD',
	'ME',
	'MF',
	'MG',
	'MH',
	'MK',
	'ML',
	'MM',
	'MN',
	'MO',
	'MP',
	'MQ',
	'MR',
	'MS',
	'MT',
	'MU',
	'MV',
	'MW',
	'MX',
	'MY',
	'MZ',
	'NA',
	'NC',
	'NE',
	'NF',
	'NG',
	'NI',
	'NL',
	'NO',
	'NP',
	'NR',
	'NU',
	'NZ',
	'OM',
	'PA',
	'PE',
	'PF',
	'PG',
	'PH',
	'PK',
	'PL',
	'PM',
	'PN',
	'PR',
	'PS',
	'PT',
	'PW',
	'PY',
	'QA',
	'RE',
	'RO',
	'RS',
	'RU',
	'RW',
	'SA',
	'SB',
	'SC',
	'SD',
	'SE',
	'SG',
	'SH',
	'SI',
	'SJ',
	'SK',
	'SL',
	'SM',
	'SN',
	'SO',
	'SR',
	'SS',
	'ST',
	'SV',
	'SX',
	'SY',
	'SZ',
	'TC',
	'TD',
	'TF',
	'TG',
	'TH',
	'TJ',
	'TK',
	'TL',
	'TM',
	'TN',
	'TO',
	'TR',
	'TT',
	'TV',
	'TW',
	'TZ',
	'UA',
	'UG',
	'UM',
	'US',
	'UY',
	'UZ',
	'VA',
	'VC',
	'VE',
	'VG',
	'VI',
	'VN',
	'VU',
	'WF',
	'WS',
	'XK',
	'YE',
	'YT',
	'ZA',
	'ZM',
	'ZW'
] as const;

export const editProfileSchema = z.object({
	customName: Fields.textFieldOptional({
		label: m.user_customName(),
		bottomText: m.user_forms_customName_info(),
		maxLength: CUSTOM_URL_MAX_LENGTH,
		toLowerCase: true
	}),
	bio: Fields.textAreaOptional({ label: m.user_bio(), maxLength: 2000 }),
	showDiscordUniqueName: Fields.toggle({
		label: m.user_forms_showDiscordUniqueName(),
		bottomText: m.user_forms_showDiscordUniqueName_info()
	}),
	commissionsOpen: Fields.toggle({
		label: m.user_forms_commissionsOpen()
	})
});

export type EditProfileSchemaData = z.infer<typeof editProfileSchema>;

export const userEditActionSchemaOld = z
	.object({
		country: z.preprocess(
			falsyToNull,
			z
				.string()
				.refine((val) => !val || COUNTRY_CODES.includes(val as any))
				.nullable()
		),
		bio: z.preprocess(falsyToNull, z.string().max(2000).nullable()),
		customUrl: z.preprocess(
			falsyToNull,
			z
				.string()
				.max(CUSTOM_URL_MAX_LENGTH)
				.refine((val) => val === null || isCustomUrl(val), {
					message: 'forms.errors.invalidCustomUrl.numbers'
				})
				.refine((val) => val === null || /^[a-zA-Z0-9-_]+$/.test(val), {
					message: 'forms.errors.invalidCustomUrl.strangeCharacter'
				})
				.transform((val) => val?.toLowerCase())
				.nullable()
		),
		customName: safeNullableStringSchema({ max: CUSTOM_URL_MAX_LENGTH }),
		battlefy: z.preprocess(falsyToNull, z.string().max(32).nullable()),
		stickSens: z.preprocess(
			processMany(actualNumber, undefinedToNull),
			z
				.number()
				.min(-50)
				.max(50)
				.refine((val) => val % 5 === 0)
				.nullable()
		),
		motionSens: z.preprocess(
			processMany(actualNumber, undefinedToNull),
			z
				.number()
				.min(-50)
				.max(50)
				.refine((val) => val % 5 === 0)
				.nullable()
		),
		inGameNameText: z.preprocess(falsyToNull, z.string().max(20).nullable()),
		inGameNameDiscriminator: z.preprocess(
			falsyToNull,
			z
				.string()
				.refine((val) => /^[0-9a-z]{4,5}$/.test(val))
				.nullable()
		),
		css: customCssVarObject,
		weapons: z.preprocess(
			safeJSONParse,
			z
				.array(
					z.object({
						weaponSplId,
						isFavorite: dbBoolean
					})
				)
				.max(5)
		),
		favoriteBadgeIds: z.preprocess(
			processMany(safeJSONParse, emptyArrayToNull),
			z
				.array(id)
				.min(1)
				.max(SMALL_BADGES_PER_DISPLAY_PAGE + 1)
				.nullish()
		),
		showDiscordUniqueName: z.preprocess(checkboxValueToDbBoolean, dbBoolean),
		commissionsOpen: z.preprocess(checkboxValueToDbBoolean, dbBoolean),
		commissionText: z.preprocess(falsyToNull, z.string().max(1000).nullable())
	})
	.refine(
		(val) => {
			if (val.motionSens !== null && val.stickSens === null) {
				return false;
			}

			return true;
		},
		{
			message: m.user_forms_errors_invalidSens()
		}
	);
