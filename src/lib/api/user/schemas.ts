import { m } from '$lib/paraglide/messages';
import {
	actualNumber,
	customCssVarObject,
	dbBoolean,
	emptyArrayToNull,
	falsyToNull,
	id,
	processMany,
	safeJSONParse,
	undefinedToNull,
	weaponSplId
} from '$lib/schemas';
import z from 'zod';
import * as Fields from '$lib/form/fields';
import { COUNTRY_CODES } from '$lib/constants/common';
import { countryCodeToTranslatedName } from '$lib/utils/i18n';

const CUSTOM_URL_MAX_LENGTH = 32;

export const SMALL_BADGES_PER_DISPLAY_PAGE = 9;

export const identifier = z.string().min(1).max(CUSTOM_URL_MAX_LENGTH).toLowerCase().trim();

export const customUrlRegexp = new RegExp(/^(?=.*[a-zA-Z_-])[a-zA-Z0-9_-]+$/);

export const inGameNameRegexp = new RegExp(/^\D{1,20}#[0-9a-z]{4,5}$/);

export const editProfileSchema = z.object({
	customName: Fields.textFieldOptional({
		label: m.user_customName(),
		bottomText: m.user_forms_customName_info(),
		maxLength: CUSTOM_URL_MAX_LENGTH
	}),
	customUrl: Fields.textFieldOptional({
		label: m.user_customUrl(),
		bottomText: m.user_forms_info_customUrl(),
		maxLength: CUSTOM_URL_MAX_LENGTH,
		leftAddon: 'sendou.ink/u/',
		toLowerCase: true,
		regExp: {
			pattern: customUrlRegexp,
			message: m.user_forms_errors_invalidCustomUrl_format()
		}
	}),
	inGameName: Fields.textFieldOptional({
		label: m.user_ign(),
		bottomText: m.user_ign_bottomText(),
		maxLength: 20 + 1 + 5,
		regExp: {
			pattern: inGameNameRegexp,
			message: m.user_forms_errors_invalidInGameName_format()
		}
	}),
	battlefy: Fields.textFieldOptional({
		label: m.user_battlefy(),
		bottomText: m.user_forms_info_battlefy(),
		leftAddon: 'battlefy.com/users/',
		maxLength: 32
	}),
	country: Fields.selectOptional({
		label: m.user_country(),
		items: COUNTRY_CODES.map((countryCode) => ({
			label: (language) =>
				countryCodeToTranslatedName({
					countryCode,
					language
				}),
			value: countryCode
		}))
	}),
	weapons: Fields.weaponPool({
		label: m.user_weaponPool(),
		maxCount: 5
	}),
	bio: Fields.textAreaOptional({ label: m.user_bio(), maxLength: 2000 }),
	hideDiscordUniqueName: Fields.toggle({
		label: m.user_forms_hideDiscordUniqueName(),
		bottomText: m.user_forms_hideDiscordUniqueName_info()
	}),
	commissionsOpen: Fields.toggle({
		label: m.user_forms_commissionsOpen()
	}),
	commissionText: Fields.textAreaOptional({
		label: m.user_forms_commissionText(),
		bottomText: m.user_forms_commissionText_info(),
		maxLength: 1000
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
		)
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
