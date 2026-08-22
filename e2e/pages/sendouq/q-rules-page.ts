import type { Page } from "@playwright/test";
import { SENDOUQ_RULES_PAGE } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

export class QRulesPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			heading: page.getByRole("heading", { name: "SendouQ Rules" }),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: SENDOUQ_RULES_PAGE });
	}
}
