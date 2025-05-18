export const DEFAULT_LANGUAGE = "en";

export const languages = [
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
		code: "pt-BR",
		name: "Português do Brasil",
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
		name: "中文",
	},
] as const;

export type LanguageCode = (typeof languages)[number]["code"];

export const config = {
	supportedLngs: languages.map((lang) => lang.code),
	fallbackLng: DEFAULT_LANGUAGE,
	defaultNS: "common",
	react: { useSuspense: false },
	interpolation: {
		escapeValue: false,
	},
};
