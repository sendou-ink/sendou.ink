import { z } from "zod";
import { _action } from "~/utils/zod";

export const settingsEditSchema = z.union([
	z.object({
		_action: _action("UPDATE_DISABLE_BUILD_ABILITY_SORTING"),
		newValue: z.boolean(),
	}),
	z.object({
		_action: _action("PLACEHOLDER"),
	}),
]);
