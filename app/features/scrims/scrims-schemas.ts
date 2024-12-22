import { add, sub } from "date-fns";
import { z } from "zod";
import { _action, date, falsyToNull, id } from "~/utils/zod";
import { LUTI_DIVS } from "./scrims-constants";

export const deletePostSchema = z.object({
	_action: _action("DELETE_POST"),
	scrimPostId: id,
});

export const fromSchema = z.union([
	z.object({ mode: z.literal("PICKUP"), users: z.array(id).min(3).max(6) }),
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

export const scrimsActionSchema = z.union([
	deletePostSchema,
	newRequestSchema,
	acceptRequestSchema,
	cancelRequestSchema,
]);

export const MAX_SCRIM_POST_TEXT_LENGTH = 500;

export const scrimsNewActionSchema = z.object({
	at: z.preprocess(
		date,
		z
			.date()
			// xxx: is this correct? if so then comment
			.min(sub(new Date(), { days: 1 }))
			.max(add(new Date(), { days: 8 })),
	),
	divs: z
		.object({
			min: z.enum(LUTI_DIVS),
			max: z.enum(LUTI_DIVS),
		})
		.nullable()
		.refine(
			(divs) => {
				if (!divs) return true;
				const minIndex = LUTI_DIVS.indexOf(divs.min);
				const maxIndex = LUTI_DIVS.indexOf(divs.max);

				return minIndex <= maxIndex;
			},
			{ message: "min div must be less than or equal to max div" },
		),
	from: fromSchema,
	postText: z.preprocess(
		falsyToNull,
		z.string().max(MAX_SCRIM_POST_TEXT_LENGTH),
	),
	// xxx:
	// visibility:
});
