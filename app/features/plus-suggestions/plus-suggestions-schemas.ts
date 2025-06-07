import { z } from "zod";
import { _action, actualNumber, trimmedString } from "~/utils/zod";
import { PLUS_SUGGESTION, PLUS_TIERS } from "./plus-suggestions-constants";

export const followUpCommentActionSchema = z.object({
	comment: z.preprocess(
		trimmedString,
		z.string().min(1).max(PLUS_SUGGESTION.COMMENT_MAX_LENGTH),
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
		z.string().min(1).max(PLUS_SUGGESTION.FIRST_COMMENT_MAX_LENGTH),
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
