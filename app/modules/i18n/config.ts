export const DEFAULT_LANGUAGE = "en";

/** Languages the site's texts can be shown in */
export const languages = [
	{
		code: "de",
		name: "Deutsch",
	},
	{
		code: "en",
		name: "English",
	},
	{
		code: "es-ES",
		name: "Español (España)",
	},
	{
		code: "es-US",
		name: "Español (Latino)",
	},
	{
		code: "fr-EU",
		name: "Français",
	},
	{
		code: "ja",
		name: "日本語",
	},
	{
		code: "zh",
		name: "中文",
	},
] as const;

/** Languages Splatoon 3 is translated to, what in-game names (weapons, gear, stages etc.) can be shown in */
export const gameLanguages = [
	{
		code: "de",
		name: "Deutsch",
	},
	{
		code: "en",
		name: "English",
	},
	{
		code: "es-ES",
		name: "Español (España)",
	},
	{
		code: "es-US",
		name: "Español (Latino)",
	},
	{
		code: "fr-CA",
		name: "Français (NoA)",
	},
	{
		code: "fr-EU",
		name: "Français (NoE)",
	},
	{
		code: "it",
		name: "Italiano",
	},
	{
		code: "ja",
		name: "日本語",
	},
	{
		code: "ko",
		name: "한국어",
	},
	{
		code: "nl",
		name: "Nederlands",
	},
	{
		code: "ru",
		name: "Русский",
	},
	{
		code: "zh",
		name: "中文",
	},
] as const;

export const languagesUnified = [
	{
		code: "da",
		name: "Dansk",
	},
	{
		code: "de",
		name: "Deutsch",
	},
	{
		code: "en",
		name: "English",
	},
	{
		code: "es",
		name: "Español",
	},
	{
		code: "fr",
		name: "Français",
	},
	{
		code: "he",
		name: "עברית",
	},
	{
		code: "it",
		name: "Italiano",
	},
	{
		code: "ja",
		name: "日本語",
	},
	{
		code: "ko",
		name: "한국어",
	},
	{
		code: "pl",
		name: "Polski",
	},
	{
		code: "pt",
		name: "Português",
	},
	{
		code: "nl",
		name: "Nederlands",
	},
	{
		code: "ru",
		name: "Русский",
	},
	{
		code: "zh",
		name: "中文（普通话）",
	},
	{
		code: "yue",
		name: "中文（廣東話）",
	},
] as const;

export type LanguageCode = (typeof languages)[number]["code"];
export type GameLanguageCode = (typeof gameLanguages)[number]["code"];
export type UnifiedLanguageCode = (typeof languagesUnified)[number]["code"];

export const ALWAYS_LOADED_NAMESPACES = [
	"common",
	"forms",
	"game-misc",
	"weapons",
	"front",
	"friends",
] as const;

/** Namespaces of in-game names, shown in the game language instead of the site's language */
export const GAME_NAMESPACES = [
	"game-badges",
	"game-misc",
	"gear",
	"weapons",
] as const;

/** Regional variants that only hold what differs from the language they fall back to */
const PARENT_LANGUAGES: Partial<Record<GameLanguageCode, GameLanguageCode>> = {
	"es-US": "es-ES",
	"fr-CA": "fr-EU",
};

/** The language followed by the languages its missing translations fall back to, English last */
export function languageChain(language: GameLanguageCode): GameLanguageCode[] {
	if (language === DEFAULT_LANGUAGE) return [DEFAULT_LANGUAGE];

	const parent = PARENT_LANGUAGES[language];
	const fallbacks: GameLanguageCode[] = parent
		? languageChain(parent)
		: [DEFAULT_LANGUAGE];

	return [language, ...fallbacks];
}

export const config = {
	supportedLngs: languages.map((lang) => lang.code),
	fallbackLng: {
		...Object.fromEntries(
			languages.map((lang) => [lang.code, languageChain(lang.code).slice(1)]),
		),
		default: [DEFAULT_LANGUAGE],
	},
	defaultNS: "common",
	react: { useSuspense: false },
	interpolation: {
		escapeValue: false,
	},
	returnEmptyString: false,
};
