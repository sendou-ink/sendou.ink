import { z } from "zod";
import { customField, select, stringConstant, toggle } from "~/form/fields";
import { themeInputSchema } from "~/utils/zod";

export const customThemeSchema = z.object({
	_action: stringConstant("UPDATE_CUSTOM_THEME"),
	newValue: customField({ initialValue: null }, themeInputSchema.nullable()),
});

export const clockFormatSchema = z.object({
	_action: stringConstant("UPDATE_CLOCK_FORMAT"),
	newValue: select({
		label: "labels.clockFormat",
		items: [
			{ value: "auto", label: "options.clockFormat.auto" },
			{ value: "24h", label: "options.clockFormat.24h" },
			{ value: "12h", label: "options.clockFormat.12h" },
		],
	}),
});

export const disableBuildAbilitySortingSchema = z.object({
	_action: stringConstant("UPDATE_DISABLE_BUILD_ABILITY_SORTING"),
	newValue: toggle({
		label: "labels.disableBuildAbilitySorting",
		bottomText: "bottomTexts.disableBuildAbilitySorting",
	}),
});

export const disallowScrimPickupsFromUntrustedSchema = z.object({
	_action: stringConstant("DISALLOW_SCRIM_PICKUPS_FROM_UNTRUSTED"),
	newValue: toggle({
		label: "labels.disallowScrimPickupsFromUntrusted",
		bottomText: "bottomTexts.disallowScrimPickupsFromUntrusted",
	}),
});

export const updateNoScreenSchema = z.object({
	_action: stringConstant("UPDATE_NO_SCREEN"),
	newValue: toggle({
		label: "labels.noScreen",
		bottomText: "bottomTexts.noScreen",
	}),
});

export const settingsEditSchema = z.union([
	customThemeSchema,
	disableBuildAbilitySortingSchema,
	disallowScrimPickupsFromUntrustedSchema,
	updateNoScreenSchema,
	clockFormatSchema,
]);
