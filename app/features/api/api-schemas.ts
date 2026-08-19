import * as v from "valibot";
import { _action } from "~/utils/zod";

export const apiActionSchema = v.union([
	v.object({
		_action: _action("GENERATE_READ"),
	}),
	v.object({
		_action: _action("GENERATE_WRITE"),
	}),
]);
