import { z } from "zod";
import type { CustomThemeVar } from "~/db/tables";
import { _action } from "~/utils/zod";

export const settingsEditSchema = z.union([
	z.object({
		_action: _action("UPDATE_CUSTOM_THEME"),
		newValue: z
			.object({
				"--base-h": z.number().min(0).max(360),
				"--base-c": z.number().min(0).max(0.1),
				"--acc-h": z.number().min(0).max(360),
				"--acc-c": z.number().min(0).max(0.3),
			} satisfies Record<CustomThemeVar, z.ZodNumber>)
			.nullable(),
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
