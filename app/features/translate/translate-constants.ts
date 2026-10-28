import {
	DEFAULT_LANGUAGE,
	type LanguageCode,
	languages,
} from "~/modules/i18n/config";

export const TRANSLATE = {
	PAGE_SIZE: 25,
	/** Routes and files shown per string before collapsing the rest into a count */
	USAGE_ITEMS_SHOWN: 4,
} as const;

/** Most visible texts, listed before the other namespaces */
export const PRIORITY_NAMESPACES: readonly string[] = [
	"common",
	"front",
	"forms",
];

/** Generated from game data, not translated by hand */
export const GENERATED_NAMESPACES = [
	"weapons",
	"gear",
	"game-badges",
	"game-misc",
] as const;

export const TRANSLATABLE_LANGUAGES = languages
	.map((language) => language.code)
	.filter(
		(code): code is Exclude<LanguageCode, typeof DEFAULT_LANGUAGE> =>
			code !== DEFAULT_LANGUAGE,
	);

export type TranslatableLanguage = (typeof TRANSLATABLE_LANGUAGES)[number];

export const TRANSLATION_STATUSES = [
	"untranslated",
	"translated",
	"drafts",
	"all",
] as const;

export type TranslationStatus = (typeof TRANSLATION_STATUSES)[number];
