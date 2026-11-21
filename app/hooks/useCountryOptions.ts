import { useTranslation } from "react-i18next";
import { COUNTRY_CODES } from "~/features/user-page/user-page-constants";
import { useHydrated } from "~/hooks/useHydrated";
import { countryCodeToTranslatedName } from "~/utils/i18n";

/** Every country as a select option, labelled in the user's language once hydrated and sorted by it. */
export function useCountryOptions() {
	const { i18n } = useTranslation();
	const isHydrated = useHydrated();

	return COUNTRY_CODES.map((countryCode) => ({
		value: countryCode,
		label: isHydrated
			? countryCodeToTranslatedName({
					countryCode,
					language: i18n.language,
				})
			: countryCode,
	})).sort((a, b) =>
		a.label.localeCompare(b.label, i18n.language, { sensitivity: "base" }),
	);
}
