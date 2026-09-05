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
			badgesSelector: page.getByTestId("badges-selector"),
			badgeDisplay: page.getByTestId("badge-display"),
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
		await this.addWidgetButton(widgetId).click();
	}

	addWidgetButton(widgetId: string) {
		return this.page.getByTestId(`add-widget-${widgetId}`);
	}

	/** Shown in place of the add button for a widget the user is not a supporter for. */
	supporterOnlyLabel(widgetId: string) {
		return this.page.getByTestId(`supporter-only-${widgetId}`);
	}

	/** Removes one of the selected widgets by its id. */
	async removeWidget(widgetId: string) {
		await this.page.getByTestId(`remove-widget-${widgetId}`).click();
	}

	/** Expands the settings of one of the selected widgets. */
	async openWidgetSettings(widgetId: string) {
		await this.page.getByTestId(`widget-settings-${widgetId}`).click();
	}

	/** Picks one favorite badge in the badges widget's settings. */
	async selectFavoriteBadge(badgeId: number) {
		await this.locators.badgesSelector.selectOption(String(badgeId));
	}

	/** Fills the bio widget's settings, expanded right after adding it. */
	async fillBio(text: string) {
		await this.page.getByLabel("Bio").fill(text);
	}

	async save() {
		await submit(this.page, this.locators.saveButton);
	}
}
