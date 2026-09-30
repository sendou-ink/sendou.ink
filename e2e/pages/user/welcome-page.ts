import type { Page } from "@playwright/test";
import { WELCOME_PAGE } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

/** `/welcome` */
export class WelcomePage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			heading: page.getByRole("heading", {
				name: "Introduction to competitive Splatoon and sendou.ink",
			}),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: WELCOME_PAGE });
	}
}
