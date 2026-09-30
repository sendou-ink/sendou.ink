import type { Page } from "@playwright/test";
import { SUPPORT_PAGE } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

/** `/support` */
export class SupportPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			patreonLink: page.getByRole("link", { name: "Support on Patreon" }),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: SUPPORT_PAGE });
	}

	perk(name: string) {
		return this.page.getByText(name, { exact: true });
	}
}
