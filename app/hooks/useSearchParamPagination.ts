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
