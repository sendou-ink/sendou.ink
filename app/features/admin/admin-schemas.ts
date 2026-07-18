import { z } from "zod";
import {
	datetimeRequired,
	image,
	stringConstant,
	textFieldRequired,
} from "~/form/fields";
import { friendCode, id } from "~/utils/zod";

export const adminActionSearchParamsSchema = z.object({
	friendCode,
});

export const createExternalStreamSchema = z.object({
	_action: stringConstant("CREATE"),
	name: textFieldRequired({ label: "labels.name", maxLength: 64 }),
	url: textFieldRequired({
		label: "labels.link",
		maxLength: 200,
		validate: "url",
	}),
	avatar: image({ label: "labels.logo", autoValidate: true }),
	startTime: datetimeRequired({ label: "labels.startTime" }),
});

const deleteExternalStreamSchema = z.object({
	_action: stringConstant("DELETE"),
	id,
});

export const externalStreamActionSchema = z.union([
	createExternalStreamSchema,
	deleteExternalStreamSchema,
]);
