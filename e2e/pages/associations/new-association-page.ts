import type { Page } from "@playwright/test";
import { createNewAssociationSchema } from "~/features/associations/associations-schemas";
import { newAssociationsPage } from "~/utils/urls";
import { navigate, submit } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

/** `/associations/new`: the dialog naming a new association. */
export class NewAssociationPage {
	private readonly page: Page;
	readonly form;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, createNewAssociationSchema);
		this.locators = {
			limitReachedError: page.getByText(
				"You have reached the maximum number of associations",
			),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: newAssociationsPage() });
	}

	async save() {
		await submit(
			this.page,
			this.page.getByRole("dialog").getByTestId("submit-button"),
		);
	}
}
