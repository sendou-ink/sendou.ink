import { SETTINGS_TAB_SLUGS, type SettingsTabSlug } from "./settings-constants";

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
