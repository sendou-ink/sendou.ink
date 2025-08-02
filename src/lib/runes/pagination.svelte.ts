export class Pagination<T> {
	page = $state(1);
	items: T[];
	pageSize: number;
	scrollToTop: boolean;

	constructor(items: () => T[], options: { pageSize: number; scrollToTop?: boolean }) {
		this.items = $derived(items());
		this.pageSize = options.pageSize;
		this.scrollToTop = options.scrollToTop ?? true;
	}

	get pagesCount() {
		return Math.ceil(this.items.length / this.pageSize);
	}

	get itemsOnPage() {
		const startIndex = (this.page - 1) * this.pageSize;
		const endIndex = startIndex + this.pageSize;
		return this.items.slice(startIndex, endIndex);
	}

	get everythingVisible() {
		return this.items.length <= this.pageSize;
	}

	nextPage() {
		if (this.page >= this.pagesCount) return;

		this.page += 1;
		this.scrollToTopIfEnabled();
	}

	previousPage() {
		if (this.page <= 1) return;

		this.page -= 1;
		this.scrollToTopIfEnabled();
	}

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
