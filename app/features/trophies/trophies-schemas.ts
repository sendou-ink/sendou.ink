import * as v from "valibot";
import {
	customField,
	stringConstant,
	textAreaOptional,
	textField,
} from "~/form/fields";
import {
	_action,
	id,
	preprocess,
	safeJSONParse,
	superRefine,
} from "~/utils/schema";
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
	creatorId: customField({ initialValue: null }, v.nullish(id)),
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
	creatorId: customField({ initialValue: null }, v.nullish(id)),
	description: textAreaOptional({
		label: "labels.trophyInformation",
		maxLength: TROPHY_DESCRIPTION_MAX_LENGTH,
	}),
});

export const trophyFormSchema = v.variant("_action", [
	createTrophyFormSchema,
	updateTrophyFormSchema,
]);

const trophyBackfillAwards = v.pipe(
	v.array(
		v.object({
			tournamentId: id,
			userIds: v.pipe(v.array(id), v.minLength(1), v.maxLength(50)),
		}),
	),
	v.minLength(1),
	v.check(
		(awards) =>
			new Set(awards.map((award) => award.tournamentId)).size === awards.length,
		"Duplicate tournament",
	),
);

export const trophyActionSchema = v.union([
	v.object({
		_action: _action("DELETE"),
		submissionId: id,
	}),
	v.object({
		_action: _action("DECLINE"),
		submissionId: id,
		reason: v.pipe(
			v.string(),
			v.trim(),
			v.minLength(TROPHY_DECLINE_REASON_MIN_LENGTH),
			v.maxLength(TROPHY_DECLINE_REASON_MAX_LENGTH),
		),
	}),
	v.object({
		_action: _action("APPROVE"),
		submissionId: id,
	}),
	v.object({
		_action: _action("BACKFILL"),
		trophyId: id,
		seriesId: id,
		awards: preprocess(safeJSONParse, trophyBackfillAwards),
	}),
]);
