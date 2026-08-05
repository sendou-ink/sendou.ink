import { z } from "zod";
import { _action } from "~/utils/zod";

export const apiActionSchema = z.union([
	z.object({
		_action: _action("GENERATE_READ"),
	}),
	z.object({
		_action: _action("GENERATE_WRITE"),
	}),
]);
