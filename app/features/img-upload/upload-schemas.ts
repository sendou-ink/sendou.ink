import * as v from "valibot";
import { _action, id, preprocess, safeJSONParse } from "~/utils/schema";

const validateManySchema = v.object({
	_action: _action("VALIDATE"),
	imageIds: preprocess(
		safeJSONParse,
		v.pipe(v.array(id), v.minLength(1), v.maxLength(5)),
	),
});

const rejectSchema = v.object({
	_action: _action("REJECT"),
	imageId: id,
});

export const validateImageSchema = v.union([validateManySchema, rejectSchema]);
