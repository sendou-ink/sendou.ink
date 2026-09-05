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
	"schedule",
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
	"trophies",
	"params",
	"welcome",
] as const;
assertType<Namespace, (typeof ALL_NAMESPACES)[number]>();
assertType<(typeof ALL_NAMESPACES)[number], Namespace>();

export function allI18nNamespaces() {
	return [...ALL_NAMESPACES];
}

/** Localized display name of an ISO country code, falling back to the code itself. */
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
		return regionDisplayNames(language).of(countryCode) ?? countryCode;
	} catch (e) {
		logger.error(
			`Error getting display name for country code "${countryCode}":`,
			e,
		);
		return countryCode;
	}
}

/**
 * Ordinal suffixes keyed by CLDR ordinal plural category. A leading `^` marks superscript.
 * Languages without a written ordinal suffix are `null`: no suffix beats borrowing the English one.
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

const displayNamesCache = new Map<string, Intl.DisplayNames>();

function regionDisplayNames(language: string): Intl.DisplayNames {
	let displayNames = displayNamesCache.get(language);
	if (!displayNames) {
		displayNames = new Intl.DisplayNames([language], { type: "region" });
		displayNamesCache.set(language, displayNames);
	}

	return displayNames;
}

const pluralRulesCache = new Map<string, Intl.PluralRules>();

/** Localized ordinal suffix (`"^st"` for 1 in English; leading `^` = superscript), empty when the language has none. */
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
