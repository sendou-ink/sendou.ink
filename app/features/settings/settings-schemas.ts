import * as v from "valibot";
import { hidden, select, stringConstant, toggle } from "~/form/fields";
import { themeInputSchema } from "~/utils/schema";

export const customThemeSchema = v.object({
	_action: stringConstant("UPDATE_CUSTOM_THEME"),
	newValue: hidden(v.nullable(themeInputSchema), null),
	revalidateRoot: v.optional(v.nullable(v.literal(true))),
});

export const clockFormatSchema = v.object({
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

export const disableBuildAbilitySortingSchema = v.object({
	_action: stringConstant("UPDATE_DISABLE_BUILD_ABILITY_SORTING"),
	newValue: toggle({
		label: "labels.disableBuildAbilitySorting",
		bottomText: "bottomTexts.disableBuildAbilitySorting",
	}),
});

export const disallowScrimPickupsFromUntrustedSchema = v.object({
	_action: stringConstant("DISALLOW_SCRIM_PICKUPS_FROM_UNTRUSTED"),
	newValue: toggle({
		label: "labels.disallowScrimPickupsFromUntrusted",
		bottomText: "bottomTexts.disallowScrimPickupsFromUntrusted",
	}),
});

export const spoilerFreeModeSchema = v.object({
	_action: stringConstant("UPDATE_SPOILER_FREE_MODE"),
	newValue: toggle({
		label: "labels.spoilerFreeMode",
		bottomText: "bottomTexts.spoilerFreeMode",
	}),
});

export const weaponReportDefaultOpenSchema = v.object({
	_action: stringConstant("UPDATE_WEAPON_REPORT_DEFAULT_OPEN"),
	newValue: v.boolean(),
});

export const settingsEditSchema = v.union([
	customThemeSchema,
	disableBuildAbilitySortingSchema,
	disallowScrimPickupsFromUntrustedSchema,
	spoilerFreeModeSchema,
	clockFormatSchema,
	weaponReportDefaultOpenSchema,
]);
