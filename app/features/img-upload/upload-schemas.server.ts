import { z } from "zod";
import { _action, id, safeJSONParse } from "~/utils/zod";

const validateManySchema = z.object({
	_action: _action("VALIDATE"),
	imageIds: z.preprocess(safeJSONParse, z.array(id).min(1).max(5)),
});

const rejectSchema = z.object({
	_action: _action("REJECT"),
	imageId: id,
});

export const validateImageSchema = z.union([validateManySchema, rejectSchema]);
