import type { Page } from "@playwright/test";
import { navigate } from "../../helpers/playwright";

const IMAGE_VALIDATION_PAGE = "/upload/admin";

/** `/upload/admin`, where an admin approves user submitted images. */
export class ImageValidationPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			images: this.page.locator("main img"),
			approveAllButton: this.page.getByRole("button", {
				name: /All .* above ok/,
			}),
			allValidatedText: this.page.getByText("All validated!"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: IMAGE_VALIDATION_PAGE });
	}

	async approveAll() {
		await this.locators.approveAllButton.click();
	}
}
