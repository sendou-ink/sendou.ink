import { add, sub } from "date-fns";
import { z } from "zod";
import {
	_action,
	date,
	falsyToNull,
	filterOutNullishMembers,
	id,
	noDuplicates,
} from "~/utils/zod";
import { associationIdentifierSchema } from "../associations/associations-schemas";
import { LUTI_DIVS, SCRIM } from "./scrims-constants";

export const deletePostSchema = z.object({
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
});

export const acceptRequestSchema = z.object({
	_action: _action("ACCEPT_REQUEST"),
	scrimPostRequestId: id,
});

export const cancelRequestSchema = z.object({
	_action: _action("CANCEL_REQUEST"),
	scrimPostRequestId: id,
});

export const cancelScrimSchema = z.object({
	reason: z.string().trim().min(1).max(SCRIM.CANCEL_REASON_MAX_LENGTH),
});

export const scrimsActionSchema = z.union([
	deletePostSchema,
	newRequestSchema,
	acceptRequestSchema,
	cancelRequestSchema,
]);

export const MAX_SCRIM_POST_TEXT_LENGTH = 500;

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
		divs: z
			.object({
				min: z.enum(LUTI_DIVS).nullable(),
				max: z.enum(LUTI_DIVS).nullable(),
			})
			.nullable()
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
			.refine(
				(divs) => {
					if (!divs?.min || !divs.max) return true;

					const minIndex = LUTI_DIVS.indexOf(divs.min);
					const maxIndex = LUTI_DIVS.indexOf(divs.max);

					return minIndex >= maxIndex;
				},
				{ message: "Min div must be less than or equal to max div" },
			),
		from: fromSchema,
		postText: z.preprocess(
			falsyToNull,
			z.string().max(MAX_SCRIM_POST_TEXT_LENGTH).nullable(),
		),
		managedByAnyone: z.boolean(),
	})
	.superRefine((post, ctx) => {
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
