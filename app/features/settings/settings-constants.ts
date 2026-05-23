export const SETTINGS_TAB_SLUGS = [
	"preferences",
	"match-profile",
	"locale",
	"theme",
	"sounds",
] as const;

export type SettingsTabSlug = (typeof SETTINGS_TAB_SLUGS)[number];
