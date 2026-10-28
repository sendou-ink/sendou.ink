import {
	GAME_NAMESPACES,
	type GameLanguageCode,
	type LanguageCode,
	languageChain,
} from "./config";

const localeFileUrls = import.meta.glob<string>("../../../locales/*/*.json", {
	query: "?url",
	import: "default",
	eager: true,
});

/** Fingerprinted URL of the language's translations of the namespace, `null` if it has none */
export function localeFileUrl(
	language: string,
	namespace: string,
): string | null {
	return (
		localeFileUrls[`../../../locales/${language}/${namespace}.json`] ?? null
	);
}

/** Whether the namespace holds in-game names, which are shown in the game language */
export function isGameNamespace(namespace: string) {
	return GAME_NAMESPACES.some((gameNamespace) => gameNamespace === namespace);
}

/** Languages whose files make up the namespace's translations, most specific first */
export function namespaceLanguages({
	namespace,
	locale,
	gameLanguage,
}: {
	namespace: string;
	locale: LanguageCode;
	gameLanguage: GameLanguageCode;
}): GameLanguageCode[] {
	return languageChain(isGameNamespace(namespace) ? gameLanguage : locale);
}
