import * as React from "react";
import { useTranslation } from "react-i18next";

/**
 * Detect when the locale returned by the root route loader changes and call
 * `i18n.changeLanguage` with the new locale so translations load automatically.
 *
 * Vendored from remix-i18next (removed in v8).
 */
export function useChangeLanguage(locale: string) {
	const { i18n } = useTranslation();
	React.useEffect(() => {
		if (i18n.language !== locale) i18n.changeLanguage(locale);
	}, [locale, i18n]);
}
