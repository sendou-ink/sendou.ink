import type { Page } from "@playwright/test";

const TYPE_LABELS = {
	weapons: "Weapons",
	users: "Users",
	teams: "Teams",
	organizations: "Organizations",
	tournaments: "Tournaments",
};

export class GlobalSearchDialog {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			openButton: page.getByRole("button", { name: /Search/ }),
			dialog: page.getByRole("dialog", { name: "Search" }),
			input: page.getByPlaceholder("Search..."),
		};
	}

	option(name: string) {
		return this.page.getByRole("option", { name, exact: true });
	}

	async open() {
		await this.locators.openButton.click();
		await this.locators.dialog.waitFor({ state: "visible" });
	}

	/** Which kind of entity the query searches; remembered across dialog openings. */
	async selectType(type: keyof typeof TYPE_LABELS) {
		await this.locators.dialog.getByText(TYPE_LABELS[type]).click();
	}

	async search(query: string) {
		await this.locators.input.fill(query);
	}

	async selectOption(name: string) {
		const option = this.option(name);
		await option.waitFor({ state: "visible" });
		await option.click({ force: true });
	}
}
