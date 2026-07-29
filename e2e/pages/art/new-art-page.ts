import type { Page } from "@playwright/test";
import { newArtPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { UserArtPage } from "./user-art-page";

/** `/art/new` */
export class NewArtPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			fileInput: this.page.locator('input[type="file"]'),
			preview: this.page.locator("form img"),
			saveButton: this.page.getByRole("button", { name: "Save" }),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: newArtPage() });
	}

	async selectImage(filePath: string) {
		await this.locators.fileInput.setInputFiles(filePath);
	}

	/** Lands on the uploader's own art page. */
	async save() {
		await this.locators.saveButton.click();
		return new UserArtPage(this.page);
	}
}
