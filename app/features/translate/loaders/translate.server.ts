import * as TranslationCatalog from "../core/TranslationCatalog.server";

export const loader = async () => {
	return {
		languages: TranslationCatalog.progressByLanguage(),
	};
};
