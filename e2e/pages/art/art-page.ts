import type { Page } from "@playwright/test";
import { artPage } from "~/features/art/art-urls";
import { navigate } from "../../helpers/playwright";

/** `/art`, the art of every artist */
export class ArtPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			images: this.page.getByTestId("art-image"),
			showcaseTab: this.page.getByRole("tab", { name: "Showcase" }),
			commissionsOpenSwitch: this.page.getByRole("switch", {
				name: "Commissions open",
			}),
			tagSelect: this.page.getByRole("button", { name: "Select a tag" }),
			clearTagFilterButton: this.page.getByTestId("clear-filter-button"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: artPage() });
	}

	/** Each art's link to the page of the artist who made it. */
	artistLink(username: string) {
		return this.page.getByRole("link", { name: username });
	}

	/** Switches from the recently uploaded art to one art per artist. */
	async openShowcase() {
		await this.locators.showcaseTab.click();
	}

	/** Narrows the showcase down to the art having the tag. */
	async filterByTag(tag: string) {
		await this.locators.tagSelect.click();
		await this.page.getByRole("option", { name: tag, exact: true }).click();
	}

	async clearTagFilter() {
		await this.locators.clearTagFilterButton.click();
	}

	/** Shows only the art of artists taking commissions, or everyone's again. */
	async toggleCommissionsOpenOnly() {
		// the switch indicator covers its input
		await this.locators.commissionsOpenSwitch.click({ force: true });
	}
}
