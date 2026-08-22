import type { Page } from "@playwright/test";
import { CONTRIBUTIONS_PAGE } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

/** `/contributions` */
export class ContributionsPage {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async goto() {
		await navigate({ page: this.page, url: CONTRIBUTIONS_PAGE });
	}

	contributor(name: string) {
		return this.page.getByText(name);
	}
}
