import { z } from "zod";
import {
	idConstant,
	selectDynamic,
	stringConstant,
	textAreaRequired,
	userSearch,
} from "~/form/fields";
import { _action, actualNumber } from "~/utils/zod";
import { PLUS_TIERS } from "./plus-suggestions-constants";

export const followUpCommentFormSchema = z.object({
	tier: idConstant(),
	suggestedId: idConstant(),
	comment: textAreaRequired({
		label: "labels.comment",
		maxLength: 280,
	}),
});

const suggestionTextFormFieldSchema = textAreaRequired({
	label: "labels.comment",
	maxLength: 500,
});

export const newSuggestionFormSchema = z.object({
	tier: selectDynamic({ label: "labels.plusTier" }),
	userId: userSearch({ label: "labels.user" }),
	comment: suggestionTextFormFieldSchema,
});

export const editSuggestionFormSchema = z.object({
	_action: stringConstant("EDIT_SUGGESTION"),
	suggestionId: idConstant(),
	comment: suggestionTextFormFieldSchema,
});

export const suggestionActionSchema = z.union([
	editSuggestionFormSchema,
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
