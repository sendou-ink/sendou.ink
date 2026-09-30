import type { Page } from "@playwright/test";
import { newOrganizationSchema } from "~/features/tournament-organization/tournament-organization-schemas";
import { ORGANIZATION_NEW_PAGE } from "~/utils/urls";
import { navigate, submit } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

export class NewOrganizationPage {
	private readonly page: Page;
	readonly form;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, newOrganizationSchema);
		this.locators = {
			heading: page.getByRole("heading", { name: "New Organization" }),
			noPermissionsAlert: page.getByText("No permissions to add organizations"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: ORGANIZATION_NEW_PAGE });
	}

	async save() {
		await submit(this.page);
	}
}
