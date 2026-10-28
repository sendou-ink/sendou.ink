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
			// "Top Search" links exist too
			openButton: page.getByRole("link", { name: /^Search/ }),
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

	/** Desktop Chrome's user agent is not a Mac's, so the shortcut is Ctrl+K. */
	async openWithShortcut() {
		await this.page.keyboard.press("Control+k");
		await this.locators.dialog.waitFor({ state: "visible" });
	}

	async close() {
		// Escape on a filled search input clears it instead of closing the dialog
		await this.locators.input.clear();
		await this.page.keyboard.press("Escape");
		await this.locators.dialog.waitFor({ state: "hidden" });
	}

	/** Which kind of entity the query searches; remembered across dialog openings. */
	async selectType(type: keyof typeof TYPE_LABELS) {
		await this.locators.dialog.getByText(TYPE_LABELS[type]).click();
	}

	async search(query: string) {
		await this.locators.input.fill(query);
	}

	/** Types key by key, firing keydown events unlike {@link search}. */
	async type(query: string) {
		await this.locators.input.pressSequentially(query);
	}

	async selectOption(name: string) {
		const option = this.option(name);
		await option.waitFor({ state: "visible" });
		await option.click({ force: true });
	}
}
