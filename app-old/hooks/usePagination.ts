import * as React from "react";

export function usePagination<T>({
	items,
	pageSize,
}: {
	items: T[];
	pageSize: number;
}) {
	const [currentPage, setCurrentPage] = React.useState(1);
	const pagesCount = Math.ceil(items.length / pageSize);

	const itemsToDisplay = React.useMemo(
		() => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
		[currentPage, items, pageSize],
	);

	const nextPage = React.useCallback(() => {
		if (currentPage < pagesCount) {
			setCurrentPage((prev) => prev + 1);
			window.scrollTo(0, 0);
		}
	}, [currentPage, pagesCount]);

	const previousPage = React.useCallback(() => {
		if (currentPage > 1) {
			setCurrentPage((prev) => prev - 1);
			window.scrollTo(0, 0);
		}
	}, [currentPage]);

	const setPage = React.useCallback(
		(page: number) => {
			if (page > 0 && page <= pagesCount) {
				setCurrentPage(page);
				window.scrollTo(0, 0);
			}
		},
		[pagesCount],
	);

	const thereIsNextPage = currentPage < pagesCount;
	const thereIsPreviousPage = currentPage > 1;

	// if the list changes from externally it might be that we are on a page that doesn't exist anymore
	// setting state inside render looks weird but should be ok
	if (itemsToDisplay.length === 0 && currentPage > 1) {
		setCurrentPage(1);
	}

	return {
		pagesCount,
		currentPage,
		itemsToDisplay,
		nextPage,
		previousPage,
		setPage,
		thereIsNextPage,
		thereIsPreviousPage,
		everythingVisible: items.length === itemsToDisplay.length,
	};
}
