import type { LoaderFunctionArgs } from "react-router";
import { parseParams } from "~/utils/remix.server";
import * as TranslationCatalog from "../core/TranslationCatalog.server";
import * as TranslationEntries from "../core/TranslationEntries.server";
import * as TranslationUnits from "../core/TranslationUnits";
import { translateLanguageParamsSchema } from "../translate-schemas";

export type TranslateLanguageLoaderData = typeof loader;

/** Besides the page's header, the whole language: the browser checks the translator's drafts against it */
export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { language } = parseParams({
		params,
		schema: translateLanguageParamsSchema,
	});

	const units = TranslationCatalog.units(language);
	const translations = TranslationCatalog.translations(language);

	return {
		language,
		progress: TranslationUnits.progress(units, translations),
		namespaces: TranslationEntries.namespaceSummaries(units, translations),
		catalog: {
			language,
			english: TranslationCatalog.english(),
			translations,
			inherited: TranslationCatalog.inherited(language),
		},
	};
};
