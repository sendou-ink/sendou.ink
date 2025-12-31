import type { Namespace } from "~/modules/i18n/resources.server";
import { logger } from "./logger";
import { assertType } from "./types";

// xxx: migrate over reused keys from already translated files

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
