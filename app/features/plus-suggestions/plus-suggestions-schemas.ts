import * as v from "valibot";
import {
	idConstant,
	selectDynamic,
	stringConstant,
	textArea,
	userSearch,
} from "~/form/fields";
import { _action, actualNumber, preprocess } from "~/utils/schema";
import { PLUS_TIERS } from "./plus-suggestions-constants";

export const followUpCommentFormSchema = v.object({
	tier: idConstant(),
	suggestedId: idConstant(),
	comment: textArea({
		label: "labels.comment",
		maxLength: 280,
	}),
});

const suggestionTextFormFieldSchema = textArea({
	label: "labels.comment",
	maxLength: 500,
});

export const newSuggestionFormSchema = v.object({
	tier: selectDynamic({ label: "labels.plusTier" }),
	userId: userSearch({ label: "labels.user" }),
	comment: suggestionTextFormFieldSchema,
});

export const editSuggestionFormSchema = v.object({
	_action: stringConstant("EDIT_SUGGESTION"),
	suggestionId: idConstant(),
	comment: suggestionTextFormFieldSchema,
});

export const suggestionActionSchema = v.union([
	editSuggestionFormSchema,
	v.object({
		_action: _action("DELETE_COMMENT"),
		suggestionId: preprocess(actualNumber, v.number()),
	}),
	v.object({
		_action: _action("DELETE_SUGGESTION_OF_THEMSELVES"),
		tier: preprocess(
			actualNumber,
			v.pipe(
				v.number(),
				v.minValue(Math.min(...PLUS_TIERS)),
				v.maxValue(Math.max(...PLUS_TIERS)),
			),
		),
	}),
]);
