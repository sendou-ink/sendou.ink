import { add } from "date-fns";
import * as v from "valibot";
import {
	array,
	customField,
	dayMonthYear as dayMonthYearField,
	fieldset,
	idConstantOptional,
	radioGroup,
	select,
	selectOptional,
	stageSelect,
	textField,
	weaponPool,
	weaponSelectOptional,
} from "~/form/fields";
import { modesShort } from "~/modules/in-game-lists/modes";
import { id, nonEmptyString } from "~/utils/schema";
import { videoMatchTypes } from "./vods-constants";
import { extractYoutubeIdFromVideoUrl } from "./vods-utils";

export const HOURS_MINUTES_SECONDS_REGEX = /^(\d{1,2}:)?\d{1,2}:\d{2}$/;

const povSchema = v.union([
	v.object({
		type: v.literal("USER"),
		userId: v.optional(id),
	}),
	v.object({
		type: v.literal("NAME"),
		name: v.pipe(nonEmptyString, v.maxLength(100)),
	}),
]);

const matchFieldsetSchema = v.object({
	startsAt: textField({
		label: "labels.vodStartTimestamp",
		placeholder: "placeholders.vodStartTimestamp",
		maxLength: 10,
		regExp: {
			pattern: HOURS_MINUTES_SECONDS_REGEX,
			message: "Invalid time format. Use HH:MM:SS or MM:SS",
		},
	}),
	mode: radioGroup({
		label: "labels.vodMode",
		items: modesShort.map((mode) => ({
			label: `modes.${mode}` as const,
			value: mode,
		})),
		initialValue: "SZ",
	}),
	stageId: stageSelect({ label: "labels.vodStage" }),
	weapon: weaponSelectOptional({ label: "labels.vodWeapon" }),
	weaponsTeamOne: weaponPool({
		label: "labels.vodWeaponsTeamOne",
		maxCount: 4,
		disableSorting: true,
		disableFavorites: true,
		allowDuplicates: true,
	}),
	weaponsTeamTwo: weaponPool({
		label: "labels.vodWeaponsTeamTwo",
		maxCount: 4,
		disableSorting: true,
		disableFavorites: true,
		allowDuplicates: true,
	}),
});

export const vodFormBaseSchema = v.object({
	vodToEditId: idConstantOptional(),
	youtubeUrl: textField({
		label: "labels.vodYoutubeUrl",
		maxLength: 200,
		inputMode: "url",
		validate: {
			func: (val) => extractYoutubeIdFromVideoUrl(val) !== null,
			message: "Invalid YouTube URL",
		},
	}),
	title: textField({
		label: "labels.vodTitle",
		maxLength: 100,
	}),
	date: dayMonthYearField({
		label: "labels.vodDate",
		max: () => add(new Date(), { days: 1 }),
		maxMessage: "errors.dateMustNotBeFuture",
		minMessage: "errors.dateTooOld",
	}),
	type: select({
		label: "labels.type",
		items: videoMatchTypes.map((type) => ({
			label: `vodTypes.${type}` as const,
			value: type,
		})),
	}),
	teamSize: selectOptional({
		label: "labels.vodTeamSize",
		items: [
			{ label: () => "1v1", value: "1" },
			{ label: () => "2v2", value: "2" },
			{ label: () => "3v3", value: "3" },
			{ label: () => "4v4", value: "4" },
		],
	}),
	pov: customField(
		{ initialValue: { type: "USER" as const } },
		v.optional(povSchema),
	),
	matches: array({
		label: "labels.vodMatches",
		min: 1,
		max: 50,
		field: fieldset({ fields: matchFieldsetSchema }),
	}),
});
