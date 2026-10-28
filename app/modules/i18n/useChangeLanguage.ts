import * as React from "react";
import { useTranslation } from "react-i18next";
import {
	GAME_NAMESPACES,
	type GameLanguageCode,
	type LanguageCode,
} from "~/modules/i18n/config";
import { loadDateFnsLocale } from "~/utils/dates";
import { currentGameLanguage, setGameLanguage } from "./loader";

/**
 * Switches the languages when the root loader's ones change: `i18n.changeLanguage` for the site's language,
 * loading the date-fns locale first so the re-render already has it, and reloading the in-game names for the
 * game language. Vendored from remix-i18next (removed in v8).
 */
export function useChangeLanguage({
	locale,
	gameLanguage,
}: {
	locale: LanguageCode;
	gameLanguage: GameLanguageCode;
}) {
	const { i18n } = useTranslation();
	React.useEffect(() => {
		const changeGameLanguage = async () => {
			if (currentGameLanguage() === gameLanguage) return;

			setGameLanguage(gameLanguage);
			const loadedLanguages = Object.keys(i18n.store.data);
			await i18n.reloadResources(
				loadedLanguages,
				GAME_NAMESPACES.filter((namespace) =>
					loadedLanguages.some((language) =>
						i18n.hasResourceBundle(language, namespace),
					),
				),
			);
			// re-renders every component using translations
			i18n.emit("languageChanged", i18n.language);
		};

		void changeGameLanguage().then(async () => {
			if (i18n.language === locale) return;

			await loadDateFnsLocale(locale);
			await i18n.changeLanguage(locale);
		});
	}, [locale, gameLanguage, i18n]);
}
