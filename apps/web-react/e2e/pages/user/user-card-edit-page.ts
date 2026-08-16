import type { Page } from "@playwright/test";
import { updateUserCardSchema } from "~/features/user-card/user-card-schemas";
import { submit } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

/** `/user-card/edit` */
export class UserCardEditPage {
	private readonly page: Page;
	readonly form;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, updateUserCardSchema);
	}

	async selectBannerColor(hexCode: string) {
		await this.page.getByRole("button", { name: hexCode }).click();
	}

	async save() {
		await submit(this.page);
	}
}
