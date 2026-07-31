import type { Locator, Page } from "@playwright/test";
import { weaponParamsPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

export class WeaponParamsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			weaponHeaders: page.locator("th[class*='weaponHeader']"),
			hideWeaponButtons: page.locator("[data-testid^='hide-weapon-']"),
			showAllWeaponsButton: page.getByTestId("show-all-weapons"),
			compareParamButtons: page.getByTestId("compare-param"),
			comparisonDialog: page.getByRole("dialog"),
			comparisonBars: page
				.getByRole("dialog")
				.locator("[class*='bars'] [class*='row']"),
			expandableRows: page.locator("[class*='expandableRow']"),
			patchHistoryTab: page.getByRole("tab", { name: /Patch history/ }),
			patchColumns: page.locator("[class*='column']"),
			subAndSpecialChangesSwitch: page.getByRole("switch", {
				name: /Show sub & special changes/,
			}),
		};
	}

	async goto(weaponSlug: string) {
		await navigate({ page: this.page, url: weaponParamsPage(weaponSlug) });
	}

	historyRow(nth: number) {
		return new ParamHistoryRow(this.locators.expandableRows.nth(nth));
	}

	async hideWeapon(nth = 0) {
		await this.locators.hideWeaponButtons.nth(nth).click();
	}

	async showAllWeapons() {
		await this.locators.showAllWeaponsButton.click();
	}

	async openParamComparison(nth = 0) {
		await this.locators.compareParamButtons.nth(nth).click();
	}

	async closeParamComparison() {
		await this.page.keyboard.press("Escape");
	}

	async openPatchHistoryTab() {
		await this.locators.patchHistoryTab.click();
	}

	async toggleSubAndSpecialChanges() {
		await this.locators.subAndSpecialChangesSwitch.click({ force: true });
	}
}

class ParamHistoryRow {
	readonly root: Locator;

	constructor(root: Locator) {
		this.root = root;
	}

	/** Shown while the row is collapsed, hidden once expanded */
	get historyBadge() {
		return this.root.locator("[class*='historyBadge']").first();
	}

	async toggle() {
		await this.root.locator("td[class*='paramName']").click();
	}
}
