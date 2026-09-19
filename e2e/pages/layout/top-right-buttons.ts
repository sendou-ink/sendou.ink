import type { Page } from "@playwright/test";

/** The button cluster at the right end of the site header. */
export class TopRightButtons {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			// hidden for users with any patron tier
			supportLink: page
				.getByRole("banner")
				.getByRole("link", { name: "Support" }),
			// logged out only: logged in the search opener is a link, not a button
			searchButton: page
				.getByRole("banner")
				.getByRole("button", { name: "Search" }),
		};
	}

	/** The header's status indicator showing what the user has going on, e.g. "Waiting for match". */
	globalStatus(text: string) {
		return this.page.getByRole("banner").getByRole("link", { name: text });
	}
}
