/**
 * Helper class to slice an array of items into pages and navigate between them.
 *
 * @template T The type of the items in the paginated array.
 */
export class Pagination<T> {
	private items: T[];
	private pageSize: number;
	private scrollToTop: boolean;
	page = $state(1);

	/**
	 * Helper class to slice an array of items into pages and navigate between them.
	 *
	 * @param items Function that returns the items to paginate.
	 * @param options.pageSize Number of items per page.
	 * @param options.scrollToTop Should the browser scroll to the top on page change (default: true).
	 *
	 * @example
	 * ```ts
	 * let items = $state([]);
	 * const pager = new Pagination(() => items, { pageSize: 25, scrollToTop: true });
	 *
	 * // Loop over all items on the current page
	 * {#each pager.itemsOnPage as item}
	 *   <div>{item}</div>
	 * {/each}
	 *
	 * // Show navigation buttons only if there are multiple pages
	 * {#if !pager.everythingVisible}
	 *   // Navigate pages
	 *   <button onclick={() => pager.previousPage()}>Previous</button>
	 *   <button onclick={() => pager.nextPage()}>Next</button>
	 * {/if}
	 * ```
	 */
	constructor(items: () => T[], options: { pageSize: number; scrollToTop?: boolean }) {
		this.items = $derived(items());
		this.pageSize = options.pageSize;
		this.scrollToTop = options.scrollToTop ?? true;
	}

	/**
	 * Total number of pages based on items length and page size.
	 */
	get pagesCount() {
		return Math.ceil(this.items.length / this.pageSize);
	}

	/**
	 * Items currently visible on the active page.
	 */
	get itemsOnPage() {
		const startIndex = (this.page - 1) * this.pageSize;
		const endIndex = startIndex + this.pageSize;
		return this.items.slice(startIndex, endIndex);
	}

	/**
	 * True if all items fit on a single page.
	 */
	get everythingVisible() {
		return this.items.length <= this.pageSize;
	}

	/**
	 * Goes to the next page.
	 */
	nextPage() {
		if (this.page >= this.pagesCount) return;

		this.page += 1;
		this.scrollToTopIfEnabled();
	}

	/**
	 * Goes back to the previous page.
	 */
	previousPage() {
		if (this.page <= 1) return;

		this.page -= 1;
		this.scrollToTopIfEnabled();
	}

	/**
	 * Sets the current page to a specific number.
	 *
	 * @param page The page number to set.
	 */
	setPage(page: number) {
		if (page < 1 || page > this.pagesCount) return;

		this.page = page;
		this.scrollToTopIfEnabled();
	}

	private scrollToTopIfEnabled() {
		if (this.scrollToTop) {
			window.scrollTo(0, 0);
		}
	}
}
