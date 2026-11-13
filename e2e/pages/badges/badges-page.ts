import type { Page } from "@playwright/test";
import { BADGES_PAGE } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { BadgePage } from "./badge-page";

/** `/badges`, every badge of the site */
export class BadgesPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			searchInput: this.page.getByRole("searchbox", { name: "Search" }),
			/** Listed first, under a "Managed badges" divider. */
			managedBadges: this.page.getByTestId("managed-badges"),
			otherBadges: this.page.getByTestId("other-badges"),
			noBadgesFoundText: this.page.getByText("No badges matching your search"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: BADGES_PAGE });
	}

	/** A badge of the list, by its name. */
	badge(name: string) {
		return this.page.getByRole("img", { name, exact: true });
	}

	/** Narrows the list down to the badges whose name contains the text. */
	async search(text: string) {
		await this.locators.searchInput.fill(text);
	}

	async openBadge(name: string) {
		await this.badge(name).click();
		return new BadgePage(this.page);
	}
}
