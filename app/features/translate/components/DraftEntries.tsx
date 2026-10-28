import { EmptyState } from "~/components/EmptyState";
import { Pagination } from "~/components/Pagination";
import { usePagination } from "~/hooks/usePagination";
import * as TranslationDrafts from "../core/TranslationDrafts";
import * as TranslationUnits from "../core/TranslationUnits";
import { TRANSLATE } from "../translate-constants";
import { useTranslationDrafts } from "../translate-drafts";
import { TranslationEntry } from "./TranslationEntry";

/** The texts with drafts, which only the browser knows of */
export function DraftEntries({
	language,
	catalog,
	namespace,
	search,
}: {
	language: string;
	catalog: TranslationDrafts.Catalog;
	namespace: string | null;
	search: string;
}) {
	const drafts = useTranslationDrafts(language);
	const { pending } = TranslationDrafts.sort({ catalog, drafts });

	const entries = TranslationUnits.filter({
		units: TranslationDrafts.units(catalog).filter((unit) =>
			unit.forms.some((form) => pending[unit.namespace]?.[form.key]),
		),
		translations: catalog.translations,
		namespace,
		search,
	}).map((unit) => ({
		...TranslationUnits.withTranslations(unit, catalog.translations),
		usage: null,
	}));

	const pagination = usePagination({
		items: entries,
		pageSize: TRANSLATE.PAGE_SIZE,
	});

	if (entries.length === 0) {
		return (
			<EmptyState navItem="settings">No texts match the filters</EmptyState>
		);
	}

	return (
		<>
			{pagination.itemsToDisplay.map((entry) => (
				<TranslationEntry
					key={`${entry.namespace}:${entry.id}`}
					entry={entry}
					language={language}
				/>
			))}
			{pagination.pagesCount > 1 ? <Pagination {...pagination} /> : null}
		</>
	);
}
