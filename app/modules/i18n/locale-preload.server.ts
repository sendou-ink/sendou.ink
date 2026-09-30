import { ALWAYS_LOADED_NAMESPACES, DEFAULT_LANGUAGE } from "./config";

const localeAssetUrls = import.meta.glob<string>("../../../locales/*/*.json", {
	query: "?url",
	import: "default",
	eager: true,
});

/**
 * Fingerprinted URLs of the always-loaded namespaces for the locale (plus English fallback), rendered as
 * `<link rel="preload">` so fetching starts at HTML parse time rather than after the client entry runs.
 */
export function localePreloadUrls(locale: string): string[] {
	const languages =
		locale === DEFAULT_LANGUAGE ? [locale] : [locale, DEFAULT_LANGUAGE];

	return languages.flatMap((language) =>
		ALWAYS_LOADED_NAMESPACES.flatMap((namespace) => {
			const url =
				localeAssetUrls[`../../../locales/${language}/${namespace}.json`];
			return url ? [url] : [];
		}),
	);
}
