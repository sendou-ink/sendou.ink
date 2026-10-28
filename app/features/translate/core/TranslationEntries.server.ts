import * as R from "remeda";
import { TRANSLATE } from "../translate-constants";
import * as TranslationUnits from "./TranslationUnits";
import * as TranslationUsage from "./TranslationUsage.server";

export type TranslationEntry = ReturnType<typeof toEntry>;

/** The unit with its current translations and where it's used, as shown on the /translate page */
export function toEntry(
	unit: TranslationUnits.TranslationUnit,
	translations: TranslationUnits.Translations,
) {
	return {
		...TranslationUnits.withTranslations(unit, translations),
		usage: trimUsage(TranslationUsage.forUnit(unit)),
	};
}

/** Translation progress per namespace */
export function namespaceSummaries(
	units: TranslationUnits.TranslationUnit[],
	translations: TranslationUnits.Translations,
) {
	return Object.entries(R.groupBy(units, (unit) => unit.namespace)).map(
		([namespace, namespaceUnits]) => ({
			namespace,
			...TranslationUnits.progress(namespaceUnits, translations),
		}),
	);
}

function trimUsage(usage: TranslationUsage.TranslationUsage | null) {
	if (!usage) return null;

	return {
		isSiteWide: usage.isSiteWide,
		routes: usage.routes.slice(0, TRANSLATE.USAGE_ITEMS_SHOWN),
		hiddenRoutesCount: Math.max(
			0,
			usage.routes.length - TRANSLATE.USAGE_ITEMS_SHOWN,
		),
		files: usage.files.slice(0, TRANSLATE.USAGE_ITEMS_SHOWN),
		hiddenFilesCount: Math.max(
			0,
			usage.files.length - TRANSLATE.USAGE_ITEMS_SHOWN,
		),
	};
}
