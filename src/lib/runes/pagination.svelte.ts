export class Pagination<T> {
	page = $state(1);
	items;
	pageSize;
	scrollToTop;

	constructor(items: () => T[], options: { pageSize: number; scrollToTop?: boolean }) {
		this.items = $derived(items());
		this.pageSize = options.pageSize;
		this.scrollToTop = options.scrollToTop ?? true;
	}

	get pagesCount() {
		return Math.ceil(this.items.length / this.pageSize);
	}

	get itemsOnPage() {
		return this.items.slice((this.page - 1) * this.pageSize, this.page * this.pageSize);
	}

	get everythingVisible() {
		return this.itemsOnPage.length === this.items.length;
	}

	nextPage() {
		if (this.page < this.pagesCount) {
			this.page += 1;
			this.#scrollToTopIfEnabled();
		}
	}

	previousPage() {
		if (this.page > 1) {
			this.page -= 1;
			this.#scrollToTopIfEnabled();
		}
	}

	setPage(page: number) {
		if (page > 0 && page <= this.pagesCount) {
			this.page = page;
			this.#scrollToTopIfEnabled();
		}
	}

	#scrollToTopIfEnabled() {
		if (this.scrollToTop) {
			window.scrollTo(0, 0);
		}
	}
}
