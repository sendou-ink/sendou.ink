import { z } from "zod";
import {
	customField,
	stringConstant,
	textAreaOptional,
	textFieldRequired,
} from "~/form/fields";
import { _action, id } from "~/utils/zod";
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
		z
			.string()
			.trim()
			.min(1)
			.max(TROPHY_MODEL_MAX_LENGTH)
			.superRefine((model, ctx) => {
				const analysis = analyzeTrophyModel(model);

				if (!analysis) {
					ctx.addIssue({ code: "custom", message: "Invalid model state" });
					return;
				}

				if (!analysis.cameraTargetCentered) {
					ctx.addIssue({
						code: "custom",
						message: "Camera target X and Z must be 0",
					});
				}

				if (!analysis.backgroundIsAlpha) {
					ctx.addIssue({
						code: "custom",
						message: "Background color must be the alpha color",
					});
				}
			}),
	);

export const createTrophyFormSchema = z.object({
	_action: stringConstant("CREATE"),
	name: textFieldRequired({
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

export const updateTrophyFormSchema = z.object({
	_action: stringConstant("UPDATE"),
	targetTrophyId: customField({ initialValue: null }, id),
	name: textFieldRequired({
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

export const trophyFormSchema = z.discriminatedUnion("_action", [
	createTrophyFormSchema,
	updateTrophyFormSchema,
]);

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
