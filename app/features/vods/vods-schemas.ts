import { add } from "date-fns";
import { z } from "zod";
import {
	array,
	customField,
	dateRequired,
	fieldset,
	idConstantOptional,
	select,
	selectOptional,
	stageSelect,
	textFieldRequired,
	weaponPool,
	weaponSelectOptional,
} from "~/form/fields";
import { modeRadioGroup } from "~/form/presets";
import {
	dayMonthYear,
	id,
	modeShort,
	nonEmptyString,
	stageId,
	weaponSplId,
} from "~/utils/zod";
import { dayMonthYearToDate } from "../../utils/dates";
import { videoMatchTypes } from "./vods-constants";
import { extractYoutubeIdFromVideoUrl } from "./vods-utils";

export const HOURS_MINUTES_SECONDS_REGEX = /^(\d{1,2}:)?\d{1,2}:\d{2}$/;

const videoMatchSchema = z.object({
	startsAt: z.string().regex(HOURS_MINUTES_SECONDS_REGEX, {
		message: "Invalid time format. Use HH:MM:SS or MM:SS",
	}),
	stageId: stageId,
	mode: modeShort,
	weapons: z.array(weaponSplId),
});

export const videoSchema = z.preprocess(
	(val: any) => (val.type === "CAST" ? { ...val, pov: undefined } : val),
	z
		.object({
			type: z.enum(videoMatchTypes),
			eventId: z.number().optional(),
			youtubeUrl: z.string().refine(
				(val) => {
					const id = extractYoutubeIdFromVideoUrl(val);

					return id !== null;
				},
				{
					message: "Invalid YouTube URL",
				},
			),
			title: nonEmptyString.max(100),
			date: dayMonthYear.refine(
				(data) => {
					const date = dayMonthYearToDate(data);

					return date < add(new Date(), { days: 1 });
				},
				{
					message: "Date must not be in the future",
				},
			),
			pov: z
				.union([
					z.object({
						type: z.literal("USER"),
						userId: id,
					}),
					z.object({
						type: z.literal("NAME"),
						name: nonEmptyString.max(100),
					}),
				])
				.optional(),
			teamSize: z.number().int().min(1).max(4).optional(),
			matches: z.array(videoMatchSchema),
		})
		.refine((data) => {
			if (data.type === "CAST") {
				const teamSize = data.teamSize ?? 4;
				return data.matches.every(
					(match) => match.weapons.length === teamSize * 2,
				);
			}

			return data.matches.every((match) => match.weapons.length === 1);
		}),
);

const povSchema = z.union([
	z.object({
		type: z.literal("USER"),
		userId: id.optional(),
	}),
	z.object({
		type: z.literal("NAME"),
		name: nonEmptyString.max(100),
	}),
]);

const matchFieldsetSchema = z.object({
	startsAt: textFieldRequired({
		label: "labels.vodStartTimestamp",
		maxLength: 10,
		regExp: {
			pattern: HOURS_MINUTES_SECONDS_REGEX,
			message: "Invalid time format. Use HH:MM:SS or MM:SS",
		},
	}),
	mode: modeRadioGroup({ label: "labels.vodMode" }),
	stageId: stageSelect({ label: "labels.vodStage" }),
	weapon: weaponSelectOptional({ label: "labels.vodWeapon" }),
	weaponsTeamOne: weaponPool({
		label: "labels.vodWeaponsTeamOne",
		maxCount: 4,
		disableSorting: true,
		disableFavorites: true,
	}),
	weaponsTeamTwo: weaponPool({
		label: "labels.vodWeaponsTeamTwo",
		maxCount: 4,
		disableSorting: true,
		disableFavorites: true,
	}),
});

export const vodFormBaseSchema = z.object({
	vodToEditId: idConstantOptional(),
	youtubeUrl: textFieldRequired({
		label: "labels.vodYoutubeUrl",
		maxLength: 200,
		validate: {
			func: (val) => extractYoutubeIdFromVideoUrl(val) !== null,
			message: "Invalid YouTube URL",
		},
	}),
	title: textFieldRequired({
		label: "labels.vodTitle",
		maxLength: 100,
	}),
	date: dateRequired({
		label: "labels.vodDate",
		max: add(new Date(), { days: 1 }),
		maxMessage: "errors.dateMustNotBeFuture",
	}),
	type: select({
		label: "labels.vodType",
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
		povSchema.optional(),
	),
	matches: array({
		label: "labels.vodMatches",
		min: 1,
		max: 50,
		field: fieldset({ fields: matchFieldsetSchema }),
	}),
});
