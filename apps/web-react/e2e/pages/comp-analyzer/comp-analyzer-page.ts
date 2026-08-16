import type { Locator, Page } from "@playwright/test";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { COMP_ANALYZER_URL } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

type Categorization = "category" | "sub" | "special";

export class CompAnalyzerPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			selectedWeapons: page.getByTestId("selected-weapons"),
			emptyWeaponSlots: page.getByText("Pick a weapon"),
			weaponGridToggle: page.getByTestId("weapon-grid-toggle"),
			categorizationToggle: page.getByTestId("categorization-toggle"),
			rangeVisualization: page.getByTestId("range-visualization"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: COMP_ANALYZER_URL });
	}

	get damageCombos() {
		return new DamageComboList(this.page.getByTestId("damage-combo-list"));
	}

	selectedWeapon(index: number) {
		return this.page.getByTestId(`selected-weapon-${index}`);
	}

	categorizationRadio(categorization: Categorization) {
		return this.page.getByTestId(`categorization-${categorization}`);
	}

	async selectWeapon(weaponSplId: MainWeaponId) {
		await this.page.getByTestId(`weapon-button-${weaponSplId}`).click();
	}

	async removeWeapon(index: number) {
		await this.page.getByTestId(`remove-weapon-${index}`).click();
	}

	async selectCategorization(categorization: Categorization) {
		await this.categorizationRadio(categorization).click();
	}

	async toggleWeaponGrid() {
		await this.locators.weaponGridToggle.click();
	}
}

class DamageComboList {
	readonly root: Locator;

	constructor(root: Locator) {
		this.root = root;
	}

	get content() {
		return this.root.locator(".content, [class*='content']");
	}

	get damageValues() {
		return this.root.locator("[class*='damageValue']");
	}

	get inkTimes() {
		return this.root.locator("[class*='inkTime']");
	}

	get damageTypeLabels() {
		return this.root.locator("[class*='damageTypeLabel']");
	}

	get filteredItems() {
		return this.root.locator("button[class*='filteredItem']");
	}

	get subDefenseSlider() {
		return this.sliders.first();
	}

	get inkResistanceSlider() {
		return this.sliders.nth(1);
	}

	async toggleCollapsed() {
		await this.root.getByTestId("damage-combo-toggle").click();
	}

	private get sliders() {
		return this.root.locator("input[type='range']");
	}
}
