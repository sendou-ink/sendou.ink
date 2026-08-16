import type { Page } from "@playwright/test";
import { navigate } from "../../helpers/playwright";
import { WelcomePage } from "../user/welcome-page";

/** `/` */
export class FrontPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			welcomeBanner: page.getByRole("link", {
				name: "New to competitive Splatoon? Start here!",
			}),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: "/" });
	}

	async openWelcomeBanner() {
		await this.locators.welcomeBanner.click();
		return new WelcomePage(this.page);
	}
}
