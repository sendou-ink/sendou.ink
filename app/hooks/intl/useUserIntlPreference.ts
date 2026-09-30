import { useTranslation } from "react-i18next";
import type { UserPreferences } from "~/db/tables-json";
import { useUser } from "~/features/auth/core/user";
import { useHydrated } from "../useHydrated";

/**
 * Language and hour cycle for formatting dates. Prefers a browser language sharing the site language's base
 * tag (`en-GB` over `en`). `isLoaded` is `false` until hydration; gate locale-dependent output on it.
 */
export function useUserIntlPreference() {
	const { i18n } = useTranslation();
	const user = useUser();
	const hydrated = useHydrated();

	const browserLanguages = hydrated ? navigator.languages : [];

	const language =
		browserLanguages.find((lang) => compareLanguages(lang, i18n.language)) ??
		i18n.language;

	return {
		language,
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
