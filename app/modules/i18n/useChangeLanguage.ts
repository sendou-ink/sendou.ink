import * as React from "react";
import { useTranslation } from "react-i18next";
import type { LanguageCode } from "~/modules/i18n/config";
import { loadDateFnsLocale } from "~/utils/dates";

/**
 * Detect when the locale returned by the root route loader changes and call
 * `i18n.changeLanguage` with the new locale so translations load automatically.
 * The date-fns locale is loaded first so the re-render triggered by the
 * language change already has it available.
 *
 * Vendored from remix-i18next (removed in v8).
 */
export function useChangeLanguage(locale: string) {
	const { i18n } = useTranslation();
	React.useEffect(() => {
		if (i18n.language !== locale) {
			void loadDateFnsLocale(locale as LanguageCode).then(() =>
				i18n.changeLanguage(locale),
			);
		}
	}, [locale, i18n]);
}
