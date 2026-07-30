import { useSearchParams } from "react-router";

/**
 * Pagination state for pages where the current page lives in the `page` search
 * param and the loader takes care of slicing the results.
 *
 * Returns props that can be spread to the `<Pagination />` component.
 *
 * For paginating a list that is fully available on the client, see `usePagination`.
 */
export function useSearchParamPagination({
	currentPage,
	pagesCount,
}: {
	currentPage: number;
	pagesCount: number;
}) {
	const [, setSearchParams] = useSearchParams();

	const setPage = (page: number) => {
		setSearchParams((params) => {
			params.set("page", String(page));
			return params;
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
