import { z } from "zod";
import {
	customField,
	stringConstant,
	textAreaOptional,
	textFieldRequired,
} from "~/form/fields";
import { _action, id } from "~/utils/zod";
import {
	TROPHY_DECLINE_REASON_MAX_LENGTH,
	TROPHY_DECLINE_REASON_MIN_LENGTH,
	TROPHY_DESCRIPTION_MAX_LENGTH,
	TROPHY_MODEL_MAX_LENGTH,
	TROPHY_NAME_MAX_LENGTH,
	TROPHY_NAME_MIN_LENGTH,
} from "./trophies-constants";

export const createTrophyFormSchema = z.object({
	_action: stringConstant("CREATE"),
	name: textFieldRequired({
		label: "labels.trophyName",
		minLength: TROPHY_NAME_MIN_LENGTH,
		maxLength: TROPHY_NAME_MAX_LENGTH,
	}),
	model: customField(
		{ initialValue: "" },
		z.string().trim().min(1).max(TROPHY_MODEL_MAX_LENGTH),
	),
	organizationId: customField({ initialValue: null }, id),
	description: textAreaOptional({
		label: "labels.trophyDescription",
		maxLength: TROPHY_DESCRIPTION_MAX_LENGTH,
	}),
});

export const pendingTrophyActionSchema = z.union([
	z.object({
		_action: _action("DELETE"),
		pendingTrophyId: id,
	}),
	z.object({
		_action: _action("DECLINE"),
		pendingTrophyId: id,
		reason: z
			.string()
			.trim()
			.min(TROPHY_DECLINE_REASON_MIN_LENGTH)
			.max(TROPHY_DECLINE_REASON_MAX_LENGTH),
	}),
	z.object({
		_action: _action("APPROVE"),
		pendingTrophyId: id,
	}),
]);
