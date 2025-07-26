import { logger } from './logger';

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
	language
}: {
	countryCode: string;
	language: string;
}) {
	// known limitation, function cannot handle e.g. GB-WLS (Wales)
	if (countryCode.includes('-')) {
		return countryCode;
	}

	try {
		return new Intl.DisplayNames([language], { type: 'region' }).of(countryCode) ?? countryCode;
	} catch (e) {
		logger.error(`Error getting display name for country code "${countryCode}":`, e);
		return countryCode; // fallback to the code itself if display name fails
	}
}
