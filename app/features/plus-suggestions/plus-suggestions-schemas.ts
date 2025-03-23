import { z } from "zod";
import {
	PLUS_TIERS,
	PlUS_SUGGESTION_COMMENT_MAX_LENGTH,
	PlUS_SUGGESTION_FIRST_COMMENT_MAX_LENGTH,
} from "~/constants";
import { _action, actualNumber, trimmedString } from "~/utils/zod";

export const followUpCommentActionSchema = z.object({
	comment: z.preprocess(
		trimmedString,
		z.string().min(1).max(PlUS_SUGGESTION_COMMENT_MAX_LENGTH),
	),
	tier: z.preprocess(
		actualNumber,
		z
			.number()
			.min(Math.min(...PLUS_TIERS))
			.max(Math.max(...PLUS_TIERS)),
	),
	suggestedId: z.preprocess(actualNumber, z.number()),
});

export const firstCommentActionSchema = z.object({
	tier: z.preprocess(
		actualNumber,
		z
			.number()
			.min(Math.min(...PLUS_TIERS))
			.max(Math.max(...PLUS_TIERS)),
	),
	comment: z.preprocess(
		trimmedString,
		z.string().min(1).max(PlUS_SUGGESTION_FIRST_COMMENT_MAX_LENGTH),
	),
	userId: z.preprocess(actualNumber, z.number().positive()),
});

export const suggestionActionSchema = z.union([
	z.object({
		_action: _action("DELETE_COMMENT"),
		suggestionId: z.preprocess(actualNumber, z.number()),
	}),
	z.object({
		_action: _action("DELETE_SUGGESTION_OF_THEMSELVES"),
		tier: z.preprocess(
			actualNumber,
			z
				.number()
				.min(Math.min(...PLUS_TIERS))
				.max(Math.max(...PLUS_TIERS)),
		),
	}),
]);
