import type { Page } from "@playwright/test";
import { createNewAssociationSchema } from "~/features/associations/associations-schemas";
import { newAssociationsPage } from "~/utils/urls";
import { navigate, submit } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

export class NewAssociationPage {
	private readonly page: Page;
	readonly form;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, createNewAssociationSchema);
	}

	async goto() {
		await navigate({ page: this.page, url: newAssociationsPage() });
	}

	async save() {
		await submit(this.page);
	}
}
