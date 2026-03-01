import { z } from "zod";
import { OBJECT_PRONOUNS, SUBJECT_PRONOUNS } from "~/db/tables";
import { BADGE } from "~/features/badges/badges-constants";
import * as Seasons from "~/features/mmr/core/Seasons";
import {
	badges,
	checkboxGroup,
	customField,
	dualSelectOptional,
	idConstantOptional,
	selectDynamicOptional,
	stringConstant,
	textAreaOptional,
	textAreaRequired,
	textFieldOptional,
	textFieldRequired,
	toggle,
	weaponPool,
} from "~/form/fields";
import {
	clothesGearIds,
	headGearIds,
	shoesGearIds,
} from "~/modules/in-game-lists/gear-ids";
import { rawSensToString } from "~/utils/strings";
import { isCustomUrl } from "~/utils/urls";
import {
	_action,
	clothesMainSlotAbility,
	headMainSlotAbility,
	id,
	safeJSONParse,
	shoesMainSlotAbility,
	stackableAbility,
} from "~/utils/zod";
import { allWidgetsFlat, findWidgetById } from "./core/widgets/portfolio";
import {
	CUSTOM_CSS_VAR_COLORS,
	HIGHLIGHT_CHECKBOX_NAME,
	HIGHLIGHT_TOURNAMENT_CHECKBOX_NAME,
	USER,
} from "./user-page-constants";

export const userParamsSchema = z.object({ identifier: z.string() });

export const seasonsSearchParamsSchema = z.object({
	page: z.coerce.number().optional(),
	info: z.enum(["weapons", "stages", "mates", "enemies"]).optional(),
	season: z.coerce
		.number()
		.optional()
		.refine((nth) => !nth || Seasons.allStarted(new Date()).includes(nth)),
});

const cssObjectSchema = z
	.record(z.string(), z.string())
	.nullable()
	.refine(
		(val) => {
			if (!val) return true;
			for (const [key, value] of Object.entries(val)) {
				if (!CUSTOM_CSS_VAR_COLORS.includes(key as never)) return false;
				if (!/^#(?:[0-9a-fA-F]{3}){1,2}[0-9]{0,2}$/.test(value)) return false;
			}
			return true;
		},
		{ message: "Invalid custom CSS colors" },
	);

const SENS_ITEMS = [
	-50, -45, -40, -35, -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 35,
	40, 45, 50,
].map((val) => ({
	label: () => rawSensToString(val),
	value: String(val),
}));

export const userEditProfileBaseSchema = z.object({
	css: customField({ initialValue: null }, cssObjectSchema),
	customName: textFieldOptional({
		label: "labels.profileCustomName",
		bottomText: "bottomTexts.profileCustomName",
		maxLength: USER.CUSTOM_NAME_MAX_LENGTH,
	}),
	customUrl: textFieldOptional({
		label: "labels.profileCustomUrl",
		bottomText: "bottomTexts.profileCustomUrl",
		leftAddon: "https://sendou.ink/u/",
		maxLength: USER.CUSTOM_URL_MAX_LENGTH,
		toLowerCase: true,
		regExp: {
			pattern: /^[a-zA-Z0-9-_]+$/,
			message: "forms:errors.profileCustomUrlStrangeChar",
		},
		validate: {
			func: isCustomUrl,
			message: "forms:errors.profileCustomUrlNumbers",
		},
	}),
	inGameName: textFieldOptional({
		label: "labels.profileInGameName",
		bottomText: "bottomTexts.profileInGameName",
		maxLength: 26,
		regExp: {
			pattern: /^.{1,10}#[0-9a-z]{4,5}$/,
			message: "forms:errors.profileInGameName",
		},
	}),
	sensitivity: dualSelectOptional({
		bottomText: "bottomTexts.profileSensBothOrNeither",
		fields: [
			{ label: "labels.profileMotionSens", items: SENS_ITEMS },
			{ label: "labels.profileStickSens", items: SENS_ITEMS },
		],
		validate: {
			func: ([motion, stick]) => {
				if (motion === null && stick === null) return true;
				if (motion !== null && stick !== null) return true;
				return false;
			},
			message: "errors.profileSensBothOrNeither",
		},
	}),
	pronouns: customField(
		{ initialValue: { subject: null, object: null } },
		z.object({
			subject: z.enum(SUBJECT_PRONOUNS).nullable(),
			object: z.enum(OBJECT_PRONOUNS).nullable(),
		}),
	),
	battlefy: textFieldOptional({
		label: "labels.profileBattlefy",
		bottomText: "bottomTexts.profileBattlefy",
		leftAddon: "https://battlefy.com/users/",
		maxLength: USER.BATTLEFY_MAX_LENGTH,
	}),
	country: selectDynamicOptional({
		label: "labels.profileCountry",
	}),
	favoriteBadgeIds: badges({
		label: "labels.profileFavoriteBadges",
		maxCount: BADGE.SMALL_BADGES_PER_DISPLAY_PAGE + 1,
	}),
	weapons: weaponPool({
		label: "labels.weaponPool",
		maxCount: USER.WEAPON_POOL_MAX_SIZE,
	}),
	bio: textAreaOptional({
		label: "labels.bio",
		maxLength: USER.BIO_MAX_LENGTH,
	}),
	showDiscordUniqueName: toggle({
		label: "labels.profileShowDiscordUniqueName",
		bottomText: "bottomTexts.profileShowDiscordUniqueName",
	}),
	commissionsOpen: toggle({
		label: "labels.profileCommissionsOpen",
		bottomText: "bottomTexts.profileCommissionsOpen",
	}),
	commissionText: textAreaOptional({
		label: "labels.profileCommissionText",
		bottomText: "bottomTexts.profileCommissionText",
		maxLength: USER.COMMISSION_TEXT_MAX_LENGTH,
	}),
	newProfileEnabled: toggle({
		label: "labels.profileNewProfileEnabled",
		bottomText: "bottomTexts.profileNewProfileEnabled",
	}),
});

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
		label: "labels.text",
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

const widgetSettingsSchemas = allWidgetsFlat().map((widget) => {
	if ("schema" in widget) {
		return z.object({
			id: z.literal(widget.id),
			settings: widget.schema,
		});
	}
	return z.object({
		id: z.literal(widget.id),
	});
});

const widgetSettingsSchema = z.union(widgetSettingsSchemas);

export const widgetsEditSchema = z.object({
	widgets: z.preprocess(
		safeJSONParse,
		z
			.array(widgetSettingsSchema)
			.max(USER.MAX_MAIN_WIDGETS + USER.MAX_SIDE_WIDGETS)
			.refine((widgets) => {
				let mainCount = 0;
				let sideCount = 0;
				for (const w of widgets) {
					const def = findWidgetById(w.id);
					if (!def) return false;
					if (def.slot === "main") mainCount++;
					else sideCount++;
				}
				return (
					mainCount <= USER.MAX_MAIN_WIDGETS &&
					sideCount <= USER.MAX_SIDE_WIDGETS
				);
			}),
	),
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
	head: customField({ initialValue: null }, headGearIdSchema),
	clothes: customField({ initialValue: null }, clothesGearIdSchema),
	shoes: customField({ initialValue: null }, shoesGearIdSchema),
	abilities: customField(
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
		label: "labels.description",
		maxLength: 280,
	}),
	modes: checkboxGroup({
		label: "labels.buildModes",
		items: modeItems,
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
