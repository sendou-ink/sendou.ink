import {
	ALWAYS_LOADED_NAMESPACES,
	type GameLanguageCode,
	type LanguageCode,
} from "./config";
import { localeFileUrl, namespaceLanguages } from "./locale-files";

/**
 * Fingerprinted URLs of the always-loaded namespaces for the languages (plus the languages they fall back to),
 * rendered as `<link rel="preload">` so fetching starts at HTML parse time rather than after the client entry runs.
 */
export function localePreloadUrls({
	locale,
	gameLanguage,
}: {
	locale: LanguageCode;
	gameLanguage: GameLanguageCode;
}): string[] {
	return ALWAYS_LOADED_NAMESPACES.flatMap((namespace) =>
		namespaceLanguages({ namespace, locale, gameLanguage }).flatMap(
			(language) => localeFileUrl(language, namespace) ?? [],
		),
	);
}
