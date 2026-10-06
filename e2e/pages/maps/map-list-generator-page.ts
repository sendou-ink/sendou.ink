import type { Page } from "@playwright/test";
import { MAPS_URL } from "~/utils/urls";
import { expect, expectIsHydrated, navigate } from "../../helpers/playwright";

export class MapListGeneratorPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			clearButton: page.getByRole("button", { name: "Clear" }),
			createMapListButton: page.getByRole("button", {
				name: "Create map list",
			}),
			generatedMapListItems: page
				.locator("ol[class*='mapList']")
				.getByRole("listitem"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: MAPS_URL });
	}

	/** Reloads the page after asserting the pool was serialized to the URL. */
	async reloadWithPersistedPool() {
		await expect(this.page).toHaveURL(/pool=/);
		await this.page.reload();
		await expectIsHydrated(this.page);
	}

	/** Checkbox of a stage in the given mode's tab of the map pool picker. */
	stageCheckbox(stageName: string) {
		return this.page
			.getByRole("tabpanel")
			.getByRole("checkbox", { name: stageName, exact: true });
	}

	async toggleMode(stageName: string, modeName: string) {
		await this.page.getByRole("tab", { name: modeName }).click();
		await this.stageCheckbox(stageName).click();
	}

	async clearMapPool() {
		await this.locators.clearButton.click();
		await this.page.getByTestId("confirm-button").click();
	}

	async createMapList() {
		await this.locators.createMapListButton.click();
	}
}
