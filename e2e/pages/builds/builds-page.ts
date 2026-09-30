import type { Page } from "@playwright/test";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { BUILDS_PAGE } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

export class BuildsPage {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async goto() {
		await navigate({ page: this.page, url: BUILDS_PAGE });
	}

	weaponLink(weaponSplId: MainWeaponId) {
		return this.page.getByTestId(`weapon-${weaponSplId}-link`);
	}

	async openWeapon(weaponSplId: MainWeaponId) {
		await this.goto();
		await this.weaponLink(weaponSplId).click();
	}
}
