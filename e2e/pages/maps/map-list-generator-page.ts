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

	stageRow(stageName: string) {
		return this.page.getByRole("group", { name: stageName });
	}

	modeButton(stageName: string, modeName: string) {
		return this.stageRow(stageName).getByRole("button", {
			name: modeName,
			exact: true,
		});
	}

	async toggleMode(stageName: string, modeName: string) {
		await this.modeButton(stageName, modeName).click();
	}

	async clearMapPool() {
		await this.locators.clearButton.click();
	}

	async createMapList() {
		await this.locators.createMapListButton.click();
	}
}
