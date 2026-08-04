import type { Page } from "@playwright/test";
import type { Ability, ModeShort } from "~/modules/in-game-lists/types";
import { weaponBuildPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { BuildCard } from "./build-card";

export class WeaponBuildsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			buildCards: page.getByTestId("build-card"),
			addFilterButton: page.getByTestId("add-filter-button"),
			deleteFilterButton: page.getByTestId("delete-filter-button"),
			comparisonSelect: page.getByTestId("comparison-select"),
			dateSelect: page.getByTestId("date-select"),
			dateInput: page.getByTestId("date-input"),
		};
	}

	async goto(weaponSlug: string) {
		await navigate({ page: this.page, url: weaponBuildPage(weaponSlug) });
	}

	buildCard(nth: number) {
		return new BuildCard(this.locators.buildCards.nth(nth));
	}

	ability(ability: Ability) {
		return this.page.getByTestId(`${ability}-ability`);
	}

	modeBadge(mode: ModeShort) {
		return this.page.getByTestId(`build-mode-${mode}`);
	}

	modeFilterCheckbox(modeName: string) {
		return this.page.getByLabel(modeName);
	}

	async addFilter(type: "ability" | "mode" | "date") {
		await this.locators.addFilterButton.click();
		await this.page.getByTestId(`menu-item-${type}`).click();
	}

	async deleteFilter() {
		await this.locators.deleteFilterButton.click();
	}
}
