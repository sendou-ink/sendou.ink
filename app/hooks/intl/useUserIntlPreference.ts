import { useTranslation } from "react-i18next";
import type { UserPreferences } from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import { useHydrated } from "../useHydrated";

// xxx: from user preference
const prefersBrowserLanguage = false;

// xxx: jsdoc
export function useUserIntlPreference() {
	const { i18n } = useTranslation();
	const user = useUser();
	const hydrated = useHydrated();

	const browserLanguages = hydrated ? navigator.languages : [];

	// does the user want to use their browser language even if the site is in another language?
	const language = prefersBrowserLanguage
		? browserLanguages.at(0)
		: // allow for e.g. en-GB browser language to be used when the site is in en
			browserLanguages.find((lang) => compareLanguages(lang, i18n.language));

	return {
		language: language ?? i18n.language,
		hourCycle: resolveHourCycle(user?.preferences?.clockFormat),
		isLoaded: hydrated,
	};
}

function resolveHourCycle(
	clockFormat: UserPreferences["clockFormat"],
): "h12" | "h23" | undefined {
	if (clockFormat === "12h") return "h12";
	if (clockFormat === "24h") return "h23";
	return undefined;
}

function compareLanguages(a: string, b: string) {
	const baseA = a.split("-")[0];
	const baseB = b.split("-")[0];

	return baseA.toUpperCase() === baseB.toUpperCase();
}
