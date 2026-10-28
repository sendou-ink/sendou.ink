import type { LoaderFunctionArgs } from "react-router";
import { paginate, parseParams } from "~/utils/remix.server";
import * as TranslationCatalog from "../core/TranslationCatalog.server";
import * as TranslationEntries from "../core/TranslationEntries.server";
import * as TranslationUnits from "../core/TranslationUnits";
import { TRANSLATE } from "../translate-constants";
import { translateLanguageParamsSchema } from "../translate-schemas";
import { translateLanguageSearchParams } from "../translate-search-params";

export const loader = async ({ request, params, url }: LoaderFunctionArgs) => {
	const { language } = parseParams({
		params,
		schema: translateLanguageParamsSchema,
	});
	const { page, namespace, status, search } =
		translateLanguageSearchParams.parse(request);

	const translations = TranslationCatalog.translations(language);

	// drafts live in the browser, it lists them on its own
	const filtered =
		status === "drafts"
			? []
			: TranslationUnits.filter({
					units: TranslationCatalog.units(language),
					translations,
					namespace,
					search,
				}).filter(
					(unit) =>
						status === "all" ||
						TranslationUnits.isTranslated(unit, translations) ===
							(status === "translated"),
				);

	const pagination = paginate({
		url,
		page,
		pageSize: TRANSLATE.PAGE_SIZE,
		totalCount: filtered.length,
	});

	return {
		entries: filtered
			.slice((page - 1) * TRANSLATE.PAGE_SIZE, page * TRANSLATE.PAGE_SIZE)
			.map((unit) => TranslationEntries.toEntry(unit, translations)),
		...pagination,
	};
};
