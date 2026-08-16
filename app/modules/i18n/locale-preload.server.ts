import { ALWAYS_LOADED_NAMESPACES, DEFAULT_LANGUAGE } from "./config";

const localeAssetUrls = import.meta.glob<string>("../../../locales/*/*.json", {
	query: "?url",
	import: "default",
	eager: true,
});

/**
 * Fingerprinted asset URLs of the always-loaded translation namespaces for the
 * given locale (plus the English fallback). Rendered as `<link rel="preload">`
 * tags in the document head so the browser starts fetching them at HTML parse
 * time instead of waiting for the client entry to load and execute.
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
