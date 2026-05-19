// xxx: this file weird location, split to constants and utils

export const SETTINGS_TAB_SLUGS = [
	"preferences",
	"match-profile",
	"locale",
	"theme",
	"sounds",
] as const;

export type SettingsTabSlug = (typeof SETTINGS_TAB_SLUGS)[number];

const PUBLIC_TABS = new Set<SettingsTabSlug>(["locale", "theme"]);

export function defaultTab(isLoggedIn: boolean): SettingsTabSlug {
	return isLoggedIn ? "match-profile" : "theme";
}

export function resolveActiveTab(
	raw: string | null,
	isLoggedIn: boolean,
): SettingsTabSlug {
	if (raw && (SETTINGS_TAB_SLUGS as readonly string[]).includes(raw)) {
		const slug = raw as SettingsTabSlug;
		if (!isLoggedIn && !PUBLIC_TABS.has(slug)) return defaultTab(false);
		return slug;
	}
	return defaultTab(isLoggedIn);
}
