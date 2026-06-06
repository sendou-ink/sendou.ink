import type { LanguageCode } from "~/modules/i18n/config";
import type { Namespace } from "~/modules/i18n/resources.server";
import { logger } from "./logger";
import { assertType } from "./types";

// note: cannot get from resources.server.ts directly, because that is a server-only file
const ALL_NAMESPACES = [
	"common",
	"analyzer",
	"badges",
	"builds",
	"calendar",
	"contributions",
	"faq",
	"forms",
	"game-badges",
	"game-misc",
	"gear",
	"user",
	"weapons",
	"scrims",
	"tournament",
	"team",
	"tier-list-maker",
	"vods",
	"art",
	"q",
	"lfg",
	"org",
	"front",
	"friends",
	"settings",
] as const;
assertType<Namespace, (typeof ALL_NAMESPACES)[number]>();
assertType<(typeof ALL_NAMESPACES)[number], Namespace>();

export function allI18nNamespaces() {
	return [...ALL_NAMESPACES];
}

/**
 * Returns the localized display name for a given ISO country code using the specified language. If the country code is unknown or the function fails for othe reason, returns the country code itself as a fallback.
 *
 * @example
 * ```typescript
 * function CountryNameComponent() {
 *  const { i18n } = useTranslation();
 *  const countryName = countryCodeToTranslatedName({
 *   countryCode: "FI",
 *   language: i18n.language,
 *  }); // "Suomi" in Finnish
 * }
 * ```
 */
export function countryCodeToTranslatedName({
	countryCode,
	language,
}: {
	countryCode: string;
	language: string;
}) {
	if (countryCode === "GB-WLS") return "Wales";
	if (countryCode === "GB-SCT") return "Scotland";
	if (countryCode === "GB-NIR") return "Northern Ireland";
	if (countryCode === "GB-ENG") return "England";

	try {
		return (
			new Intl.DisplayNames([language], { type: "region" }).of(countryCode) ??
			countryCode
		);
	} catch (e) {
		logger.error(
			`Error getting display name for country code "${countryCode}":`,
			e,
		);
		return countryCode; // fallback to the code itself if display name fails
	}
}

/**
 * Ordinal placement suffixes per language, keyed by the CLDR ordinal plural
 * category given by `Intl.PluralRules(language, { type: "ordinal" })`. A leading
 * `^` marks a suffix that should render as superscript. Languages without a
 * written ordinal suffix use explicit `null` – rendering no suffix is preferred
 * over borrowing the English one.
 */
const ORDINAL_SUFFIXES: Record<
	LanguageCode,
	Partial<Record<Intl.LDMLPluralRule, string>> | null
> = {
	da: null,
	he: null,
	nl: null,
	en: { one: "^st", two: "^nd", few: "^rd", other: "^th" },
	"es-ES": { other: "º" },
	"es-US": { other: "^o" },
	"fr-CA": { one: "^er", other: "^ème" },
	"fr-EU": { one: "^er", other: "^ème" },
	de: { other: "^." },
	it: { many: "^o", other: "^o" },
	ja: { other: "位" },
	ko: { other: "^등" },
	pl: { other: "^." },
	"pt-BR": { other: "^º" },
	ru: { other: "^ое" },
	zh: { other: "名" },
};

const pluralRulesCache = new Map<string, Intl.PluralRules>();

/**
 * Returns the localized ordinal suffix for a placement number in the given
 * language (e.g. `"^st"` for `1` in English). A leading `^` marks a suffix the
 * caller should render as superscript. Returns an empty string for languages
 * without a written ordinal suffix.
 */
export function ordinalSuffix(placement: number, language: string): string {
	const category = ordinalPluralRules(language).select(placement);

	return ORDINAL_SUFFIXES[language as LanguageCode]?.[category] ?? "";
}

function ordinalPluralRules(language: string): Intl.PluralRules {
	let rules = pluralRulesCache.get(language);
	if (!rules) {
		rules = new Intl.PluralRules(language, { type: "ordinal" });
		pluralRulesCache.set(language, rules);
	}

	return rules;
}
