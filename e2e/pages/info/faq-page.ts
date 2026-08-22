import type { Page } from "@playwright/test";
import { FAQ_PAGE } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

/** `/faq` */
export class FaqPage {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async goto() {
		await navigate({ page: this.page, url: FAQ_PAGE });
	}

	question(text: string) {
		return this.page.getByText(text);
	}
}
