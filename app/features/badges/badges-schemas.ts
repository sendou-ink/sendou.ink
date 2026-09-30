import * as v from "valibot";
import {
	_action,
	id,
	noDuplicates,
	preprocess,
	safeJSONParse,
} from "~/utils/schema";
import { BADGE } from "./badges-constants";

export const editBadgeActionSchema = v.union([
	v.object({
		_action: _action("MANAGERS"),
		managerIds: preprocess(
			safeJSONParse,
			v.pipe(
				v.array(id),
				v.check((managerIds) => noDuplicates(managerIds)),
			),
		),
	}),
	v.object({
		_action: _action("OWNERS"),
		ownerIds: preprocess(
			safeJSONParse,
			v.pipe(v.array(id), v.maxLength(BADGE.OWNERS_MAX_LENGTH)),
		),
	}),
]);
