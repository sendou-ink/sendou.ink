import * as v from "valibot";
import { _action, id, noDuplicates, safeJSONParse } from "~/utils/zod";
import { BADGE } from "./badges-constants";

export const editBadgeActionSchema = v.union([
	v.object({
		_action: _action("MANAGERS"),
		managerIds: v.preprocess(safeJSONParse, v.pipe(v.array(id), v.check(noDuplicates))),
	}),
	v.object({
		_action: _action("OWNERS"),
		ownerIds: v.preprocess(
			safeJSONParse,
			v.pipe(v.array(id), v.maxLength(BADGE.OWNERS_MAX_LENGTH)),
		),
	}),
]);
