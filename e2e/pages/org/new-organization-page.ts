import type { Page } from "@playwright/test";
import { newOrganizationSchema } from "~/features/tournament-organization/tournament-organization-schemas";
import { ORGANIZATION_NEW_PAGE } from "~/utils/urls";
import { navigate, submit } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

export class NewOrganizationPage {
	private readonly page: Page;
	readonly form;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, newOrganizationSchema);
	}

	async goto() {
		await navigate({ page: this.page, url: ORGANIZATION_NEW_PAGE });
	}

	async save() {
		await submit(this.page);
	}
}
