import { add, sub } from "date-fns";
import { z } from "zod";
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
			message: "Must have at least 3 users excluding yourself",
		})
		.max(SCRIM.MAX_PICKUP_SIZE_EXCLUDING_OWNER)
		.refine(noDuplicates, {
			message: "Users must be unique",
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
	reason: z.string().trim().min(1).max(SCRIM.CANCEL_REASON_MAX_LENGTH),
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
			message: "Both min and max div must be set or neither",
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

export const scrimsFiltersSchema = z.object({
	weekdayTimes: timeRangeSchema.nullable().catch(null),
	weekendTimes: timeRangeSchema.nullable().catch(null),
	divs: divsSchema.nullable().catch(null),
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

export const MAX_SCRIM_POST_TEXT_LENGTH = 500;

export const RANGE_END_OPTIONS = [
	"+30min",
	"+1hour",
	"+1.5hours",
	"+2hours",
	"+2.5hours",
	"+3hours",
] as const;

export const scrimsNewActionSchema = z
	.object({
		at: z.preprocess(
			date,
			z
				.date()
				.refine(
					(date) => {
						if (date < sub(new Date(), { days: 1 })) return false;

						return true;
					},
					{
						message: "Date can not be in the past",
					},
				)
				.refine(
					(date) => {
						if (date > add(new Date(), { days: 15 })) return false;

						return true;
					},
					{
						message: "Date can not be more than 2 weeks in the future",
					},
				),
		),
		rangeEnd: z
			.preprocess(
				(val) => (val === "" ? null : val),
				z.enum(RANGE_END_OPTIONS).nullable(),
			)
			.catch(null),
		baseVisibility: associationIdentifierSchema,
		notFoundVisibility: z.object({
			at: z
				.preprocess(date, z.date())
				.nullish()
				.refine(
					(date) => {
						if (!date) return true;

						if (date < sub(new Date(), { days: 1 })) return false;

						return true;
					},
					{
						message: "Date can not be in the past",
					},
				),
			forAssociation: associationIdentifierSchema,
		}),
		divs: divsSchema.nullable(),
		from: fromSchema,
		postText: z.preprocess(
			falsyToNull,
			z.string().max(MAX_SCRIM_POST_TEXT_LENGTH).nullable(),
		),
		managedByAnyone: z.boolean(),
		maps: z.enum(["NO_PREFERENCE", "SZ", "RANKED", "ALL", "TOURNAMENT"]),
		mapsTournamentId: z.preprocess(falsyToNull, id.nullable()),
	})
	.superRefine((post, ctx) => {
		if (post.maps === "TOURNAMENT" && !post.mapsTournamentId) {
			ctx.addIssue({
				path: ["mapsTournamentId"],
				message: "Tournament must be selected when maps is tournament",
				code: z.ZodIssueCode.custom,
			});
		}

		if (post.maps !== "TOURNAMENT" && post.mapsTournamentId) {
			ctx.addIssue({
				path: ["mapsTournamentId"],
				message: "Tournament should only be selected when maps is tournament",
				code: z.ZodIssueCode.custom,
			});
		}
		if (
			post.notFoundVisibility.at &&
			post.notFoundVisibility.forAssociation === post.baseVisibility
		) {
			ctx.addIssue({
				path: ["notFoundVisibility"],
				message: "Not found visibility must be different from base visibility",
				code: z.ZodIssueCode.custom,
			});
		}

		if (post.baseVisibility === "PUBLIC" && post.notFoundVisibility.at) {
			ctx.addIssue({
				path: ["notFoundVisibility"],
				message:
					"Not found visibility can not be set if base visibility is public",
				code: z.ZodIssueCode.custom,
			});
		}

		if (post.notFoundVisibility.at && post.notFoundVisibility.at < post.at) {
			ctx.addIssue({
				path: ["notFoundVisibility", "at"],
				message: "Date can not be before the scrim date",
				code: z.ZodIssueCode.custom,
			});
		}

		if (post.notFoundVisibility.at && post.at < new Date()) {
			ctx.addIssue({
				path: ["notFoundVisibility"],
				message: "Can not be set if looking for scrim now",
				code: z.ZodIssueCode.custom,
			});
		}
	});
