import { z } from "zod";
import { _action, id, noDuplicates, safeJSONParse } from "~/utils/zod";

export const editBadgeActionSchema = z.union([
	z.object({
		_action: _action("MANAGERS"),
		managerIds: z.preprocess(safeJSONParse, z.array(id).refine(noDuplicates)),
	}),
	z.object({
		_action: _action("OWNERS"),
		ownerIds: z.preprocess(safeJSONParse, z.array(id)),
	}),
]);
