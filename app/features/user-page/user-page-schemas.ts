import { z } from "zod";
import { OBJECT_PRONOUNS, SUBJECT_PRONOUNS } from "~/db/tables";
import { BADGE } from "~/features/badges/badges-constants";
import {
	checkboxGroup,
	customJsonField,
	idConstantOptional,
	stringConstant,
	textAreaOptional,
	textAreaRequired,
	textFieldRequired,
	toggle,
	weaponPool,
} from "~/form/fields";
import {
	clothesGearIds,
	headGearIds,
	shoesGearIds,
} from "~/modules/in-game-lists/gear-ids";
import { isCustomUrl } from "~/utils/urls";
import {
	_action,
	actualNumber,
	checkboxValueToDbBoolean,
	clothesMainSlotAbility,
	customCssVarObject,
	dbBoolean,
	emptyArrayToNull,
	falsyToNull,
	headMainSlotAbility,
	id,
	nullLiteraltoNull,
	processMany,
	safeJSONParse,
	safeNullableStringSchema,
	shoesMainSlotAbility,
	stackableAbility,
	undefinedToNull,
	weaponSplId,
} from "~/utils/zod";
import {
	COUNTRY_CODES,
	HIGHLIGHT_CHECKBOX_NAME,
	HIGHLIGHT_TOURNAMENT_CHECKBOX_NAME,
	USER,
} from "./user-page-constants";

export const userParamsSchema = z.object({ identifier: z.string() });

// xxx: e2e test problem, check if we want to have the refine Seasons here: season: xxx....refine((nth) => !nth || Seasons.allStarted(new Date()).includes(nth))
export const seasonsSearchParamsSchema = z.object({
	page: z.coerce.number().optional(),
	info: z.enum(["weapons", "stages", "mates", "enemies"]).optional(),
	season: z.coerce.number().optional(),
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
		subjectPronoun: z.preprocess(
			processMany(nullLiteraltoNull, falsyToNull),
			z.enum(SUBJECT_PRONOUNS).nullable(),
		),
		objectPronoun: z.preprocess(
			processMany(nullLiteraltoNull, falsyToNull),
			z.enum(OBJECT_PRONOUNS).nullable(),
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

export const addModNoteSchema = z.object({
	_action: stringConstant("ADD_MOD_NOTE"),
	value: textAreaRequired({
		label: "labels.modNoteText",
		bottomText: "bottomTexts.modNote",
		maxLength: USER.MOD_NOTE_MAX_LENGTH,
	}),
});

const deleteModNoteSchema = z.object({
	_action: _action("DELETE_MOD_NOTE"),
	noteId: id,
});

export const adminTabActionSchema = z.union([
	addModNoteSchema,
	deleteModNoteSchema,
]);

export const userResultsPageSearchParamsSchema = z.object({
	all: z.stringbool().catch(false),
	page: z.coerce.number().min(1).max(1_000).catch(1),
});

const headGearIdSchema = z
	.number()
	.nullable()
	.refine(
		(val) =>
			val === null || headGearIds.includes(val as (typeof headGearIds)[number]),
	);

const clothesGearIdSchema = z
	.number()
	.nullable()
	.refine(
		(val) =>
			val === null ||
			clothesGearIds.includes(val as (typeof clothesGearIds)[number]),
	);

const shoesGearIdSchema = z
	.number()
	.nullable()
	.refine(
		(val) =>
			val === null ||
			shoesGearIds.includes(val as (typeof shoesGearIds)[number]),
	);

// xxx: Invalid input -> This is required
const abilitiesSchema = z.tuple([
	z.tuple([
		headMainSlotAbility,
		stackableAbility,
		stackableAbility,
		stackableAbility,
	]),
	z.tuple([
		clothesMainSlotAbility,
		stackableAbility,
		stackableAbility,
		stackableAbility,
	]),
	z.tuple([
		shoesMainSlotAbility,
		stackableAbility,
		stackableAbility,
		stackableAbility,
	]),
]);

const modeItems = [
	{ label: "modes.TW" as const, value: "TW" as const },
	{ label: "modes.SZ" as const, value: "SZ" as const },
	{ label: "modes.TC" as const, value: "TC" as const },
	{ label: "modes.RM" as const, value: "RM" as const },
	{ label: "modes.CB" as const, value: "CB" as const },
];

export const newBuildBaseSchema = z.object({
	buildToEditId: idConstantOptional(),
	weapons: weaponPool({
		label: "labels.buildWeapons",
		minCount: 1,
		maxCount: 5,
		disableSorting: true,
		disableFavorites: true,
	}),
	head: customJsonField({ initialValue: null }, headGearIdSchema),
	clothes: customJsonField({ initialValue: null }, clothesGearIdSchema),
	shoes: customJsonField({ initialValue: null }, shoesGearIdSchema),
	abilities: customJsonField(
		{
			initialValue: [
				["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
				["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
				["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"],
			],
		},
		abilitiesSchema,
	),
	title: textFieldRequired({
		label: "labels.buildTitle",
		maxLength: 50,
	}),
	description: textAreaOptional({
		label: "labels.buildDescription",
		maxLength: 280,
	}),
	modes: checkboxGroup({
		label: "labels.buildModes",
		items: modeItems,
		minLength: 0,
	}),
	private: toggle({
		label: "labels.buildPrivate",
		bottomText: "bottomTexts.buildPrivate",
	}),
});

function validateGearAllOrNone(data: {
	head: number | null;
	clothes: number | null;
	shoes: number | null;
}) {
	const gearFilled = [data.head, data.clothes, data.shoes].filter(
		(g) => g !== null,
	);
	return gearFilled.length === 0 || gearFilled.length === 3;
}
export const gearAllOrNoneRefine = {
	fn: validateGearAllOrNone,
	opts: { message: "forms:errors.gearAllOrNone", path: ["head"] },
};

export const newBuildSchema = newBuildBaseSchema.refine(
	gearAllOrNoneRefine.fn,
	gearAllOrNoneRefine.opts,
);
