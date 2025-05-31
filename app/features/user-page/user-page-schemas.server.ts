import { z } from "zod";
import "~/styles/u-edit.css";
import { BADGE } from "~/features/badges/badges-constants";
import { isCustomUrl } from "~/utils/urls";
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
	weaponSplId,
} from "~/utils/zod";
import * as Seasons from "../mmr/core/Seasons";
import {
	HIGHLIGHT_CHECKBOX_NAME,
	HIGHLIGHT_TOURNAMENT_CHECKBOX_NAME,
} from "./components/UserResultsTable";
import { COUNTRY_CODES, USER } from "./user-page-constants";

export const userParamsSchema = z.object({ identifier: z.string() });

export const seasonsSearchParamsSchema = z.object({
	page: z.coerce.number().optional(),
	info: z.enum(["weapons", "stages", "mates", "enemies"]).optional(),
	season: z.coerce
		.number()
		.optional()
		.refine((nth) => !nth || Seasons.allStarted(new Date()).includes(nth)),
});

export const userEditActionSchema = z
	.object({
		country: z.preprocess(
			falsyToNull,
			z
				.string()
				.refine((val) => !val || COUNTRY_CODES.includes(val as any))
				.nullable(),
		),
		bio: z.preprocess(
			falsyToNull,
			z.string().max(USER.BIO_MAX_LENGTH).nullable(),
		),
		customUrl: z.preprocess(
			falsyToNull,
			z
				.string()
				.max(USER.CUSTOM_URL_MAX_LENGTH)
				.refine((val) => val === null || isCustomUrl(val), {
					message: "forms.errors.invalidCustomUrl.numbers",
				})
				.refine((val) => val === null || /^[a-zA-Z0-9-_]+$/.test(val), {
					message: "forms.errors.invalidCustomUrl.strangeCharacter",
				})
				.transform((val) => val?.toLowerCase())
				.nullable(),
		),
		customName: safeNullableStringSchema({ max: USER.CUSTOM_NAME_MAX_LENGTH }),
		battlefy: z.preprocess(
			falsyToNull,
			z.string().max(USER.BATTLEFY_MAX_LENGTH).nullable(),
		),
		stickSens: z.preprocess(
			processMany(actualNumber, undefinedToNull),
			z
				.number()
				.min(-50)
				.max(50)
				.refine((val) => val % 5 === 0)
				.nullable(),
		),
		motionSens: z.preprocess(
			processMany(actualNumber, undefinedToNull),
			z
				.number()
				.min(-50)
				.max(50)
				.refine((val) => val % 5 === 0)
				.nullable(),
		),
		inGameNameText: z.preprocess(
			falsyToNull,
			z.string().max(USER.IN_GAME_NAME_TEXT_MAX_LENGTH).nullable(),
		),
		inGameNameDiscriminator: z.preprocess(
			falsyToNull,
			z
				.string()
				.refine((val) => /^[0-9a-z]{4,5}$/.test(val))
				.nullable(),
		),
		css: customCssVarObject,
		weapons: z.preprocess(
			safeJSONParse,
			z
				.array(
					z.object({
						weaponSplId,
						isFavorite: dbBoolean,
					}),
				)
				.max(USER.WEAPON_POOL_MAX_SIZE),
		),
		favoriteBadgeIds: z.preprocess(
			processMany(safeJSONParse, emptyArrayToNull),
			z
				.array(id)
				.min(1)
				.max(BADGE.SMALL_BADGES_PER_DISPLAY_PAGE + 1)
				.nullish(),
		),
		showDiscordUniqueName: z.preprocess(checkboxValueToDbBoolean, dbBoolean),
		commissionsOpen: z.preprocess(checkboxValueToDbBoolean, dbBoolean),
		commissionText: z.preprocess(
			falsyToNull,
			z.string().max(USER.COMMISSION_TEXT_MAX_LENGTH).nullable(),
		),
	})
	.refine(
		(val) => {
			if (val.motionSens !== null && val.stickSens === null) {
				return false;
			}

			return true;
		},
		{
			message: "forms.errors.invalidSens",
		},
	);

export const editHighlightsActionSchema = z.object({
	[HIGHLIGHT_CHECKBOX_NAME]: z.optional(
		z.union([z.array(z.string()), z.string()]),
	),
	[HIGHLIGHT_TOURNAMENT_CHECKBOX_NAME]: z.optional(
		z.union([z.array(z.string()), z.string()]),
	),
});
