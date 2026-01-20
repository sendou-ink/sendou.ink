import { add, sub } from "date-fns";
import { z } from "zod";
import {
	customField,
	datetimeRequired,
	dualSelectOptional,
	idConstant,
	select,
	selectDynamicOptional,
	selectOptional,
	stringConstant,
	textAreaOptional,
	textAreaRequired,
	timeRangeOptional,
	toggle,
} from "~/form/fields";
import {
	_action,
	date,
	falsyToNull,
	filterOutNullishMembers,
	id,
	noDuplicates,
	safeJSONParse,
	timeString,
} from "~/utils/zod";
import { associationIdentifierSchema } from "../associations/associations-schemas";
import { LUTI_DIVS, SCRIM } from "./scrims-constants";

const deletePostSchema = z.object({
	_action: _action("DELETE_POST"),
	scrimPostId: id,
});

const fromUsers = z.preprocess(
	filterOutNullishMembers,
	z
		.array(id)
		.min(3, {
			message: "forms:errors.minUsersExcludingYourself",
		})
		.max(SCRIM.MAX_PICKUP_SIZE_EXCLUDING_OWNER)
		.refine(noDuplicates, {
			message: "forms:errors.usersMustBeUnique",
		}),
);

export const fromSchema = z.union([
	z.object({ mode: z.literal("PICKUP"), users: fromUsers }),
	z.object({ mode: z.literal("TEAM"), teamId: id }),
]);

export const newRequestSchema = z.object({
	_action: _action("NEW_REQUEST"),
	scrimPostId: id,
	from: fromSchema,
	message: z.preprocess(
		falsyToNull,
		z.string().max(SCRIM.REQUEST_MESSAGE_MAX_LENGTH).nullable(),
	),
	at: z.preprocess(date, z.date()).nullish(),
});

const acceptRequestSchema = z.object({
	_action: _action("ACCEPT_REQUEST"),
	scrimPostRequestId: id,
});

const cancelRequestSchema = z.object({
	_action: _action("CANCEL_REQUEST"),
	scrimPostRequestId: id,
});

export const cancelScrimSchema = z.object({
	reason: textAreaRequired({
		label: "labels.scrimCancelReason",
		bottomText: "bottomTexts.scrimCancelReasonHelp",
		maxLength: SCRIM.CANCEL_REASON_MAX_LENGTH,
	}),
});

const timeRangeSchema = z.object({
	start: timeString,
	end: timeString,
});

export const divsSchema = z
	.object({
		min: z.enum(LUTI_DIVS).nullable(),
		max: z.enum(LUTI_DIVS).nullable(),
	})
	.refine(
		(div) => {
			if (!div) return true;

			if (div.max && !div.min) return false;
			if (div.min && !div.max) return false;

			return true;
		},
		{
			message: "forms:errors.divBothOrNeither",
		},
	)
	.transform((divs) => {
		if (!divs.min || !divs.max) return divs;

		const minIndex = LUTI_DIVS.indexOf(divs.min);
		const maxIndex = LUTI_DIVS.indexOf(divs.max);

		if (maxIndex > minIndex) {
			return { min: divs.max, max: divs.min };
		}

		return divs;
	});

const scrimsFiltersSchema = z.object({
	weekdayTimes: timeRangeSchema.nullable().catch(null),
	weekendTimes: timeRangeSchema.nullable().catch(null),
	divs: divsSchema.nullable().catch(null),
});

const divsFormField = dualSelectOptional({
	fields: [
		{
			label: "labels.scrimMaxDiv",
			items: LUTI_DIVS.map((div) => ({ label: () => div, value: div })),
		},
		{
			label: "labels.scrimMinDiv",
			items: LUTI_DIVS.map((div) => ({ label: () => div, value: div })),
		},
	],
	validate: {
		func: ([max, min]) => {
			if ((max && !min) || (!max && min)) return false;
			return true;
		},
		message: "errors.divBothOrNeither",
	},
});

export const scrimsFiltersFormSchema = z.object({
	weekdayTimes: timeRangeOptional({
		label: "labels.weekdayTimes",
		startLabel: "labels.start",
		endLabel: "labels.end",
	}),
	weekendTimes: timeRangeOptional({
		label: "labels.weekendTimes",
		startLabel: "labels.start",
		endLabel: "labels.end",
	}),
	divs: divsFormField,
});

export const scrimsFiltersSearchParamsObject = z.object({
	filters: z
		.preprocess(safeJSONParse, scrimsFiltersSchema)
		.catch({ weekdayTimes: null, weekendTimes: null, divs: null }),
});

const persistScrimFiltersSchema = z.object({
	_action: _action("PERSIST_SCRIM_FILTERS"),
	filters: scrimsFiltersSchema,
});

export const scrimsActionSchema = z.union([
	deletePostSchema,
	newRequestSchema,
	acceptRequestSchema,
	cancelRequestSchema,
	persistScrimFiltersSchema,
]);

const MAX_SCRIM_POST_TEXT_LENGTH = 500;

export const RANGE_END_OPTIONS = [
	"+30min",
	"+1hour",
	"+1.5hours",
	"+2hours",
	"+2.5hours",
	"+3hours",
] as const;

export const scrimRequestFormSchema = z.object({
	_action: stringConstant("NEW_REQUEST"),
	scrimPostId: idConstant(),
	from: customField({ initialValue: null }, fromSchema),
	message: textAreaOptional({
		label: "labels.scrimRequestMessage",
		maxLength: SCRIM.REQUEST_MESSAGE_MAX_LENGTH,
	}),
	at: selectDynamicOptional({
		label: "labels.scrimRequestStartTime",
		bottomText: "bottomTexts.scrimRequestStartTime",
	}),
});

const rangeEndItems = [
	{ label: "options.scrimFlexibility.notFlexible" as const, value: "" },
	{ label: "options.scrimFlexibility.+30min" as const, value: "+30min" },
	{ label: "options.scrimFlexibility.+1hour" as const, value: "+1hour" },
	{ label: "options.scrimFlexibility.+1.5hours" as const, value: "+1.5hours" },
	{ label: "options.scrimFlexibility.+2hours" as const, value: "+2hours" },
	{ label: "options.scrimFlexibility.+2.5hours" as const, value: "+2.5hours" },
	{ label: "options.scrimFlexibility.+3hours" as const, value: "+3hours" },
] as const;

const mapsItems = [
	{ label: "options.scrimMaps.noPreference" as const, value: "NO_PREFERENCE" },
	{ label: "options.scrimMaps.szOnly" as const, value: "SZ" },
	{ label: "options.scrimMaps.rankedOnly" as const, value: "RANKED" },
	{ label: "options.scrimMaps.allModes" as const, value: "ALL" },
	{ label: "options.scrimMaps.tournament" as const, value: "TOURNAMENT" },
] as const;

export const scrimsNewFormSchema = z
	.object({
		at: datetimeRequired({
			label: "labels.start",
			bottomText: "bottomTexts.scrimStart",
			min: sub(new Date(), { days: 1 }),
			max: add(new Date(), { days: 15 }),
			minMessage: "errors.dateInPast",
			maxMessage: "errors.dateTooFarInFuture",
		}),
		rangeEnd: selectOptional({
			label: "labels.scrimStartFlexibility",
			bottomText: "bottomTexts.scrimStartFlexibility",
			items: [...rangeEndItems],
		}),
		baseVisibility: customField(
			{ initialValue: "PUBLIC" },
			associationIdentifierSchema,
		),
		notFoundVisibility: customField(
			{ initialValue: { at: null, forAssociation: "PUBLIC" } },
			z.object({
				at: z
					.preprocess(date, z.date())
					.nullish()
					.refine(
						(date) => {
							if (!date) return true;
							if (date < sub(new Date(), { days: 1 })) return false;
							return true;
						},
						{ message: "errors.dateInPast" },
					),
				forAssociation: associationIdentifierSchema,
			}),
		),
		divs: divsFormField,
		from: customField({ initialValue: null }, fromSchema),
		postText: textAreaOptional({
			label: "labels.text",
			maxLength: MAX_SCRIM_POST_TEXT_LENGTH,
		}),
		managedByAnyone: toggle({
			label: "labels.scrimManagedByAnyone",
			bottomText: "bottomTexts.scrimManagedByAnyone",
		}),
		maps: select({
			label: "labels.scrimMaps",
			items: [...mapsItems],
		}),
		mapsTournamentId: customField(
			{ initialValue: null },
			z.preprocess(falsyToNull, id.nullable()),
		),
	})
	.superRefine((post, ctx) => {
		if (post.maps === "TOURNAMENT" && !post.mapsTournamentId) {
			ctx.addIssue({
				path: ["mapsTournamentId"],
				message: "forms:errors.tournamentMustBeSelected",
				code: z.ZodIssueCode.custom,
			});
		}

		if (post.maps !== "TOURNAMENT" && post.mapsTournamentId) {
			ctx.addIssue({
				path: ["mapsTournamentId"],
				message: "forms:errors.tournamentOnlyWhenMapsIsTournament",
				code: z.ZodIssueCode.custom,
			});
		}

		if (
			post.notFoundVisibility.at &&
			post.notFoundVisibility.forAssociation === post.baseVisibility
		) {
			ctx.addIssue({
				path: ["notFoundVisibility"],
				message: "forms:errors.visibilityMustBeDifferent",
				code: z.ZodIssueCode.custom,
			});
		}

		if (post.baseVisibility === "PUBLIC" && post.notFoundVisibility.at) {
			ctx.addIssue({
				path: ["notFoundVisibility"],
				message: "forms:errors.visibilityNotAllowedWhenPublic",
				code: z.ZodIssueCode.custom,
			});
		}

		if (post.notFoundVisibility.at && post.notFoundVisibility.at > post.at) {
			ctx.addIssue({
				path: ["notFoundVisibility"],
				message: "forms:errors.dateAfterScrimDate",
				code: z.ZodIssueCode.custom,
			});
		}

		if (post.notFoundVisibility.at && post.at < new Date()) {
			ctx.addIssue({
				path: ["notFoundVisibility"],
				message: "forms:errors.canNotSetIfLookingNow",
				code: z.ZodIssueCode.custom,
			});
		}
	});
