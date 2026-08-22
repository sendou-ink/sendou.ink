import type { Page } from "@playwright/test";
import { LINKS_PAGE } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

/** `/links` */
export class LinksPage {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async goto() {
		await navigate({ page: this.page, url: LINKS_PAGE });
	}

	resourceLink(title: string) {
		return this.page.getByRole("link", { name: title });
	}
}
