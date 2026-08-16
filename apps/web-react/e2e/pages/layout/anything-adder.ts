import type { Page } from "@playwright/test";

type AddableItem =
	| "art"
	| "association"
	| "builds"
	| "calendarEvent"
	| "lfgPost"
	| "organization"
	| "plus"
	| "scrimPost"
	| "team"
	| "tournament"
	| "vods";

/** The "Add new…" menu of the site layout, available on every page. */
export class AnythingAdder {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			menuButton: page.getByTestId("anything-adder-menu-button").first(),
		};
	}

	async add(item: AddableItem) {
		await this.locators.menuButton.click();
		await this.page.getByTestId(`menu-item-${item}`).click();
	}
}
