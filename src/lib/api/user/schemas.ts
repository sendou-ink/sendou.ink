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
import { COUNTRY_CODES } from '$lib/constants/common';

const CUSTOM_URL_MAX_LENGTH = 32;

export const SMALL_BADGES_PER_DISPLAY_PAGE = 9;

export const identifier = z.string().min(1).max(CUSTOM_URL_MAX_LENGTH).toLowerCase().trim();

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
