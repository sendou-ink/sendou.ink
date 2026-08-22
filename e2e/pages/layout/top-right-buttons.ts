import type { Page } from "@playwright/test";

/** The button cluster at the right end of the site header. */
export class TopRightButtons {
	readonly locators;

	constructor(page: Page) {
		this.locators = {
			// hidden for users with any patron tier
			supportLink: page
				.getByRole("banner")
				.getByRole("link", { name: "Support" }),
		};
	}
}
