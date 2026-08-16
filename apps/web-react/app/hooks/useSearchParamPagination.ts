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
 * Pagination state for pages where the current page lives in the `page` search
 * param of the given search params definition and the loader takes care of
 * slicing the results.
 *
 * Returns props that can be spread to the `<Pagination />` component.
 *
 * For paginating a list that is fully available on the client, see `usePagination`.
 */
export function useSearchParamPagination<Shape extends PaginatedShape>({
	definition,
	currentPage,
	pagesCount,
}: {
	definition: SearchParamsDefinition<Shape>;
	currentPage: number;
	pagesCount: number;
}) {
	const [, setParams] = useSearchParamsTyped(definition);

	const setPage = (page: number) => {
		setParams({ page } as Partial<SearchParamsValues<Shape>>, {
			replace: false,
			preventScrollReset: false,
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
