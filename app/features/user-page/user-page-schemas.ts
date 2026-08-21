import * as v from "valibot";
import { BADGE } from "~/features/badges/badges-constants";
import { SMALL_TROPHIES_PER_DISPLAY_PAGE } from "~/features/trophies/trophies-constants";
import {
	OBJECT_PRONOUNS,
	SUBJECT_PRONOUNS,
} from "~/features/user-page/user-page-constants";
import {
	badges,
	checkboxGroup,
	customField,
	dualSelectOptional,
	idConstantOptional,
	image,
	inGameName,
	selectDynamicOptional,
	stringConstant,
	textArea,
	textAreaOptional,
	textField,
	textFieldOptional,
	toggle,
	trophies,
	weaponPool,
} from "~/form/fields";
import {
	clothesGearIds,
	headGearIds,
	shoesGearIds,
} from "~/modules/in-game-lists/gear-ids";
import {
	_action,
	actualNumber,
	clothesMainSlotAbility,
	emptyArrayToNull,
	headMainSlotAbility,
	id,
	preprocess,
	processMany,
	removeDuplicates,
	safeJSONParse,
	shoesMainSlotAbility,
	stackableAbility,
	superRefine,
} from "~/utils/schema";
import { rawSensToString } from "~/utils/strings";
import { isCustomUrl } from "~/utils/urls";
import { allWidgetsFlat, findWidgetById } from "./core/widgets/portfolio";
import {
	BUILD_SORT_IDENTIFIERS,
	HIGHLIGHT_CHECKBOX_NAME,
	HIGHLIGHT_TOURNAMENT_CHECKBOX_NAME,
	USER,
} from "./user-page-constants";

export const userParamsSchema = v.object({ identifier: v.string() });

const SENS_ITEMS = [
	-50, -45, -40, -35, -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 35,
	40, 45, 50,
].map((val) => ({
	label: () => rawSensToString(val),
	value: String(val),
}));

export const userEditProfileBaseSchema = v.object({
	customAvatar: image({
		label: "labels.profileCustomAvatar",
		bottomText: "bottomTexts.profileCustomAvatar",
		autoValidate: true,
	}),
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
	inGameName: inGameName({
		label: "labels.inGameName",
		bottomText: "bottomTexts.profileInGameName",
	}),
	sensitivity: dualSelectOptional({
		fields: [
			{ label: "labels.profileMotionSens", items: SENS_ITEMS },
			{ label: "labels.profileStickSens", items: SENS_ITEMS },
		],
		validate: {
			func: ([motion, stick]) => {
				if (motion !== null && stick === null) return false;
				return true;
			},
			message: "errors.profileSensBothOrNeither",
		},
	}),
	pronouns: dualSelectOptional({
		bottomText: "bottomTexts.profilePronouns",
		fields: [
			{
				label: "labels.pronoun",
				items: SUBJECT_PRONOUNS.map((p) => ({ label: () => p, value: p })),
			},
			{
				label: "labels.pronoun",
				items: OBJECT_PRONOUNS.map((p) => ({ label: () => p, value: p })),
			},
		],
		validate: {
			func: ([subject, object]) => {
				if (subject === null && object === null) return true;
				if (subject !== null && object !== null) return true;
				return false;
			},
			message: "errors.profilePronounsBothOrNeither",
		},
	}),
	battlefy: textFieldOptional({
		label: "labels.profileBattlefy",
		bottomText: "bottomTexts.profileBattlefy",
		leftAddon: "https://battlefy.com/users/",
		maxLength: USER.BATTLEFY_MAX_LENGTH,
	}),
	country: selectDynamicOptional({
		label: "labels.profileCountry",
		searchable: true,
	}),
	favoriteBadgeIds: badges({
		label: "labels.profileFavoriteBadges",
		maxCount: BADGE.SMALL_BADGES_PER_DISPLAY_PAGE + 1,
	}),
	favoriteTrophyIds: trophies({
		label: "labels.profileFavoriteTrophies",
		maxCount: SMALL_TROPHIES_PER_DISPLAY_PAGE,
	}),
	hiddenTrophyIds: trophies({
		label: "labels.profileHiddenTrophies",
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

export const editHighlightsActionSchema = v.object({
	[HIGHLIGHT_CHECKBOX_NAME]: v.optional(
		v.union([v.array(v.string()), v.string()]),
	),
	[HIGHLIGHT_TOURNAMENT_CHECKBOX_NAME]: v.optional(
		v.union([v.array(v.string()), v.string()]),
	),
});

export const addModNoteSchema = v.object({
	_action: stringConstant("ADD_MOD_NOTE"),
	value: textArea({
		label: "labels.text",
		bottomText: "bottomTexts.modNote",
		maxLength: USER.MOD_NOTE_MAX_LENGTH,
	}),
});

const deleteModNoteSchema = v.object({
	_action: _action("DELETE_MOD_NOTE"),
	noteId: id,
});

export const adminTabActionSchema = v.union([
	addModNoteSchema,
	deleteModNoteSchema,
]);

const widgetSettingsSchemas = allWidgetsFlat().map((widget) => {
	if ("schema" in widget && widget.schema) {
		return v.object({
			id: v.literal(widget.id),
			settings: widget.schema,
		});
	}
	return v.object({
		id: v.literal(widget.id),
	});
});

const widgetSettingsSchema = v.union(widgetSettingsSchemas);

export const widgetsEditSchema = v.object({
	widgets: preprocess(
		safeJSONParse,
		v.pipe(
			v.array(widgetSettingsSchema),
			v.maxLength(USER.MAX_MAIN_WIDGETS + USER.MAX_SIDE_WIDGETS),
			v.check((widgets) => {
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
	),
});

const headGearIdSchema = v.pipe(
	v.nullable(v.number()),
	v.check(
		(val) =>
			val === null || headGearIds.includes(val as (typeof headGearIds)[number]),
	),
);

const clothesGearIdSchema = v.pipe(
	v.nullable(v.number()),
	v.check(
		(val) =>
			val === null ||
			clothesGearIds.includes(val as (typeof clothesGearIds)[number]),
	),
);

const shoesGearIdSchema = v.pipe(
	v.nullable(v.number()),
	v.check(
		(val) =>
			val === null ||
			shoesGearIds.includes(val as (typeof shoesGearIds)[number]),
	),
);

const abilitiesSchema = v.tuple([
	v.tuple([
		headMainSlotAbility,
		stackableAbility,
		stackableAbility,
		stackableAbility,
	]),
	v.tuple([
		clothesMainSlotAbility,
		stackableAbility,
		stackableAbility,
		stackableAbility,
	]),
	v.tuple([
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

export const newBuildBaseSchema = v.object({
	buildToEditId: idConstantOptional(),
	weapons: weaponPool({
		label: "labels.buildWeapons",
		minCount: 1,
		maxCount: 5,
		disableSorting: true,
		disableFavorites: true,
		disableAltSkinDuplicates: true,
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
	title: textField({
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
	isPrivate: toggle({
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

export const newBuildSchema = v.pipe(
	newBuildBaseSchema,
	superRefine((data, ctx) => {
		if (gearAllOrNoneRefine.fn(data)) return;

		ctx.addIssue(gearAllOrNoneRefine.opts);
	}),
);

export const buildsActionSchema = v.union([
	v.object({
		_action: _action("DELETE_BUILD"),
		buildToDeleteId: preprocess(actualNumber, id),
	}),

	v.object({
		_action: _action("UPDATE_SORTING"),
		buildSorting: preprocess(
			processMany(safeJSONParse, removeDuplicates, emptyArrayToNull),
			v.nullable(v.array(v.picklist(BUILD_SORT_IDENTIFIERS))),
		),
	}),
]);
