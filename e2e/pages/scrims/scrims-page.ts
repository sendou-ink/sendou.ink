import type { Page } from "@playwright/test";
import { scrimsPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { AssociationsPage } from "../associations/associations-page";

export class ScrimsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			associationsLink: page.getByRole("link", { name: "Associations" }),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: scrimsPage() });
	}

	async openAssociations() {
		await this.locators.associationsLink.click();
		return new AssociationsPage(this.page);
	}
}
