import type { Page } from "@playwright/test";
import { SENDOUQ_INFO_PAGE } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

export class QInfoPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			generalInfoHeading: page.getByRole("heading", { name: "General info" }),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: SENDOUQ_INFO_PAGE });
	}
}
