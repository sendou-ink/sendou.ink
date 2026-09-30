import type { Page } from "@playwright/test";

/** The placement rows shared by `/xsearch` and `/xsearch/player/:id`. */
export class PlacementsTable {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	row(nth: number) {
		return this.page.getByTestId(`placement-row-${nth}`);
	}
}
