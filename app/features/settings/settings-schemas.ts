import { z } from "zod";
import { _action, themeInputSchema } from "~/utils/zod";

export { themeInputSchema };

export const settingsEditSchema = z.union([
	z.object({
		_action: _action("UPDATE_CUSTOM_THEME"),
		newValue: themeInputSchema.nullable(),
	}),
	z.object({
		_action: _action("UPDATE_DISABLE_BUILD_ABILITY_SORTING"),
		newValue: z.boolean(),
	}),
	z.object({
		_action: _action("DISALLOW_SCRIM_PICKUPS_FROM_UNTRUSTED"),
		newValue: z.boolean(),
	}),
	z.object({
		_action: _action("UPDATE_NO_SCREEN"),
		newValue: z.boolean(),
	}),
	z.object({
		_action: _action("UPDATE_CLOCK_FORMAT"),
		newValue: z.enum(["auto", "24h", "12h"]),
	}),
]);
