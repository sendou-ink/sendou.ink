import * as React from "react";
import { useTranslation } from "react-i18next";
import type { LanguageCode } from "~/modules/i18n/config";
import { loadDateFnsLocale } from "~/utils/dates";

/**
 * Calls `i18n.changeLanguage` when the root loader's locale changes, loading the date-fns locale first so
 * the re-render already has it. Vendored from remix-i18next (removed in v8).
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
