import type { Page } from "@playwright/test";
import { userPage } from "~/utils/urls";
import { navigate, submit } from "../../helpers/playwright";

/** `/u/:identifier/edit-widgets` */
export class UserEditWidgetsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			saveButton: page.getByRole("button", { name: "Save", exact: true }),
		};
	}

	async goto(discordId: string) {
		await navigate({
			page: this.page,
			url: `${userPage({ discordId })}/edit-widgets`,
		});
	}

	/** Adds a widget from the gallery by its id, e.g. `"bio"` or `"join-date"`. */
	async addWidget(widgetId: string) {
		await this.page.getByTestId(`add-widget-${widgetId}`).click();
	}

	/** Fills the bio widget's settings, expanded right after adding it. */
	async fillBio(text: string) {
		await this.page.getByLabel("Bio").fill(text);
	}

	async save() {
		await submit(this.page, this.locators.saveButton);
	}
}
