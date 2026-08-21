import * as v from "valibot";
import {
	customField,
	stringConstant,
	textAreaOptional,
	textField,
} from "~/form/fields";
import { _action, id, superRefine } from "~/utils/schema";
import { analyzeTrophyModel } from "./core/model-analysis";
import {
	TROPHY_DECLINE_REASON_MAX_LENGTH,
	TROPHY_DECLINE_REASON_MIN_LENGTH,
	TROPHY_DESCRIPTION_MAX_LENGTH,
	TROPHY_MODEL_MAX_LENGTH,
	TROPHY_NAME_MAX_LENGTH,
	TROPHY_NAME_MIN_LENGTH,
} from "./trophies-constants";

const trophyModelField = () =>
	customField(
		{ initialValue: "" },
		v.pipe(
			v.string(),
			v.trim(),
			v.minLength(1),
			v.maxLength(TROPHY_MODEL_MAX_LENGTH),
			superRefine((model, ctx) => {
				const analysis = analyzeTrophyModel(model);

				if (!analysis) {
					ctx.addIssue({ message: "Invalid model state" });
					return;
				}

				if (!analysis.cameraTargetCentered) {
					ctx.addIssue({
						message: "Camera target X and Z must be 0",
					});
				}

				if (!analysis.backgroundIsAlpha) {
					ctx.addIssue({
						message: "Background color must be the alpha color",
					});
				}
			}),
		),
	);

export const createTrophyFormSchema = v.object({
	_action: stringConstant("CREATE"),
	name: textField({
		label: "labels.trophyName",
		minLength: TROPHY_NAME_MIN_LENGTH,
		maxLength: TROPHY_NAME_MAX_LENGTH,
	}),
	model: trophyModelField(),
	organizationId: customField({ initialValue: null }, id),
	description: textAreaOptional({
		label: "labels.trophyInformation",
		maxLength: TROPHY_DESCRIPTION_MAX_LENGTH,
	}),
});

export const updateTrophyFormSchema = v.object({
	_action: stringConstant("UPDATE"),
	targetTrophyId: customField({ initialValue: null }, id),
	name: textField({
		label: "labels.trophyName",
		minLength: TROPHY_NAME_MIN_LENGTH,
		maxLength: TROPHY_NAME_MAX_LENGTH,
	}),
	model: trophyModelField(),
	organizationId: customField({ initialValue: null }, id),
	managerId: customField({ initialValue: null }, id),
	description: textAreaOptional({
		label: "labels.trophyInformation",
		maxLength: TROPHY_DESCRIPTION_MAX_LENGTH,
	}),
});

export const trophyFormSchema = v.variant("_action", [
	createTrophyFormSchema,
	updateTrophyFormSchema,
]);

export const pendingTrophyActionSchema = v.union([
	v.object({
		_action: _action("DELETE"),
		pendingTrophyId: id,
	}),
	v.object({
		_action: _action("DECLINE"),
		pendingTrophyId: id,
		reason: v.pipe(
			v.string(),
			v.trim(),
			v.minLength(TROPHY_DECLINE_REASON_MIN_LENGTH),
			v.maxLength(TROPHY_DECLINE_REASON_MAX_LENGTH),
		),
	}),
	v.object({
		_action: _action("APPROVE"),
		pendingTrophyId: id,
	}),
]);
