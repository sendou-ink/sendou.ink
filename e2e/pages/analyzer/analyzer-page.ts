import type { Locator, Page } from "@playwright/test";
import type { Ability } from "~/modules/in-game-lists/types";
import { ANALYZER_URL, weaponParamsPage } from "~/utils/urls";
import { expect, navigate, selectWeapon } from "../../helpers/playwright";
import { BuildFormPage } from "../builds/build-form-page";
import { WeaponParamsPage } from "./weapon-params-page";

type AnalyzerTab = "build1" | "build2" | "ap";

export class AnalyzerPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			newBuildPrompt: page.getByTestId("new-build-prompt"),
			abilitySelector: page.getByTestId("ability-selector"),
			rawParametersLink: page.getByRole("link", { name: /Raw parameters/ }),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: ANALYZER_URL });
	}

	statCard(testId: string) {
		return new AnalyzerStatCard(this.page, testId);
	}

	selectedAbility(ability: Ability) {
		return this.locators.abilitySelector.getByTestId(`${ability}-ability`);
	}

	apComparison(buildNumber: 1 | 2) {
		return this.page.getByTestId(`ap-compare-${buildNumber}`);
	}

	async selectWeapon(name: string) {
		await selectWeapon({ page: this.page, name });
	}

	async openStatCategory(testId: string) {
		await this.page.getByTestId(testId).click();
	}

	async selectTab(tab: AnalyzerTab) {
		await this.page.getByTestId(`${tab}-tab`).click();
	}

	async addAbility(ability: Ability) {
		await this.page.getByTestId(`${ability}-ability-button`).click();
	}

	async openNewBuildPrompt() {
		await this.locators.newBuildPrompt.click();
		return new BuildFormPage(this.page);
	}

	/** Selecting a weapon updates the link's href asynchronously, so wait for it before clicking */
	async openRawParameters(weaponSlug: string) {
		await expect(this.locators.rawParametersLink).toHaveAttribute(
			"href",
			new RegExp(weaponParamsPage(weaponSlug)),
		);
		await this.locators.rawParametersLink.click();
		return new WeaponParamsPage(this.page);
	}
}

class AnalyzerStatCard {
	readonly root: Locator;
	private readonly testId: string;

	constructor(page: Page, testId: string) {
		this.testId = testId;
		this.root = page.getByTestId(testId);
	}

	get baseValue() {
		return this.root.getByTestId(`${this.testId}-base`);
	}

	get buildValueTitle() {
		return this.root.getByTestId(`${this.testId}-build-title`);
	}
}
