import { useTranslation } from "react-i18next";
import type { UserPreferences } from "~/db/tables-json";
import { useUser } from "~/features/auth/core/user";
import { useHydrated } from "../useHydrated";
import { useServerIntl } from "./ServerIntl";

/**
 * Language, hour cycle and time zone for formatting dates. Prefers a browser language sharing the site language's
 * base tag (`en-GB` over `en`). Until hydration the browser's languages and time zone are the ones it reported to
 * the server, so the server render and the hydration render format the same as the browser does afterwards.
 * `isLoaded` is `false` while the time zone is unknown (a device's first visit, before hydration); gate
 * locale-dependent output on it.
 */
export function useUserIntlPreference() {
	const { i18n } = useTranslation();
	const user = useUser();
	const hydrated = useHydrated();
	const serverIntl = useServerIntl();

	const browserLanguages = hydrated
		? navigator.languages
		: (serverIntl?.acceptedLanguages ?? []);

	const language =
		browserLanguages.find((lang) => compareLanguages(lang, i18n.language)) ??
		i18n.language;

	return {
		language,
		hourCycle: resolveHourCycle(user?.preferences?.clockFormat),
		/** `undefined` once hydrated: the browser's own zone */
		timeZone: hydrated ? undefined : (serverIntl?.timezone ?? undefined),
		isLoaded: hydrated || Boolean(serverIntl?.timezone),
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
