import * as React from "react";
import { useLoaderData, useOutletContext } from "react-router";
import { EmptyState } from "~/components/EmptyState";
import { Pagination } from "~/components/Pagination";
import { useSearchParamPagination } from "~/hooks/useSearchParamPagination";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import { DraftEntries } from "../components/DraftEntries";
import { TranslationEntry } from "../components/TranslationEntry";
import { loader } from "../loaders/translate.$language.index.server";
import { translateLanguageSearchParams } from "../translate-search-params";
import type { TranslateLanguageOutletContext } from "./translate.$language";

export { loader };

export const shouldRevalidate = translateLanguageSearchParams.shouldRevalidate;

export default function TranslateLanguageEntriesPage() {
	const data = useLoaderData<typeof loader>();
	const { language, catalog } =
		useOutletContext<TranslateLanguageOutletContext>();
	const [{ status, namespace, search }] = useSearchParamsTyped(
		translateLanguageSearchParams,
	);
	const listTopRef = React.useRef<HTMLDivElement>(null);

	const pagination = useSearchParamPagination({
		definition: translateLanguageSearchParams,
		currentPage: data.currentPage,
		pagesCount: data.pagesCount,
		scrollTargetRef: listTopRef,
	});

	if (status === "drafts") {
		return (
			<div className="stack md">
				<DraftEntries
					language={language}
					catalog={catalog}
					namespace={namespace}
					search={search}
				/>
			</div>
		);
	}

	return (
		<>
			<div ref={listTopRef} className="stack md">
				{data.entries.length > 0 ? (
					data.entries.map((entry) => (
						<TranslationEntry
							key={`${entry.namespace}:${entry.id}`}
							entry={entry}
							language={language}
						/>
					))
				) : (
					<EmptyState navItem="settings">No texts match the filters</EmptyState>
				)}
			</div>
			{data.pagesCount > 1 ? <Pagination {...pagination} /> : null}
		</>
	);
}
