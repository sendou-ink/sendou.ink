import * as React from "react";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import type {
	ParamDef,
	SearchParamsDefinition,
	SearchParamsValues,
} from "~/modules/search-params/search-params";

type PaginatedShape = { page: ParamDef<number> } & Record<
	string,
	ParamDef<any>
>;

/**
 * `<Pagination />` props for pages whose current page lives in the definition's `page` search param and
 * whose loader slices the results. For a list fully on the client see `usePagination`.
 *
 * Changing the page scrolls to the top of the page, or to `scrollTargetRef` once the new page has rendered.
 */
export function useSearchParamPagination<Shape extends PaginatedShape>({
	definition,
	currentPage,
	pagesCount,
	scrollTargetRef,
}: {
	definition: SearchParamsDefinition<Shape>;
	currentPage: number;
	pagesCount: number;
	scrollTargetRef?: React.RefObject<HTMLElement | null>;
}) {
	const [, setParams] = useSearchParamsTyped(definition);
	const scrollPendingRef = React.useRef(false);

	React.useEffect(() => {
		if (!scrollPendingRef.current) return;
		scrollPendingRef.current = false;
		scrollTargetRef?.current?.scrollIntoView({ block: "start" });
	}, [currentPage, scrollTargetRef]);

	const setPage = (page: number) => {
		scrollPendingRef.current = Boolean(scrollTargetRef);
		setParams({ page } as Partial<SearchParamsValues<Shape>>, {
			replace: false,
			preventScrollReset: Boolean(scrollTargetRef),
		});
	};

	return {
		currentPage,
		pagesCount,
		setPage,
		nextPage: () => setPage(currentPage + 1),
		previousPage: () => setPage(currentPage - 1),
	};
}
