import { z } from "zod/v4";
import { _action } from "~/utils/zod";

export const settingsEditSchema = z.union([
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
	z.object({
		_action: _action("PLACEHOLDER"),
	}),
]);
