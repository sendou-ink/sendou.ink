import type { Page } from "@playwright/test";
import type { Tables } from "~/db/tables";
import { artFormSchema } from "~/features/art/art-schemas";
import { newArtPage } from "~/features/art/art-urls";
import { navigate } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";
import { UserArtPage } from "./user-art-page";

/** `/art/new` */
export class NewArtPage {
	private readonly page: Page;
	readonly locators;
	readonly form;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, artFormSchema);
		this.locators = {
			fileInput: this.page.locator('input[type="file"]'),
			preview: this.page.locator("form img"),
			existingImage: this.page.locator('form img[src*="-small."]'),
			descriptionInput: this.page.getByLabel(this.form.getLabel("description")),
		};
	}

	/** Given an art id, edits that art instead of uploading a new one. */
	async goto(artId?: Tables["Art"]["id"]) {
		await navigate({ page: this.page, url: newArtPage(artId) });
	}

	async selectImage(filePath: string) {
		await this.locators.fileInput.setInputFiles(filePath);
	}

	/** Lands on the uploader's own art page. */
	async save() {
		await this.form.submit();
		return new UserArtPage(this.page);
	}
}
