import type { Page } from "@playwright/test";
import { newBuildBaseSchema } from "~/features/user-page/user-page-schemas";
import { userNewBuildPage } from "~/features/user-page/user-page-urls";
import type { Ability, GearType } from "~/modules/in-game-lists/types";
import { navigate } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

export class BuildFormPage {
	private readonly page: Page;
	readonly form;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, newBuildBaseSchema);
	}

	async gotoNew(discordId: string) {
		await navigate({ page: this.page, url: userNewBuildPage({ discordId }) });
	}

	gearSelect(type: GearType) {
		return this.page.getByTestId(`${type}-gear-select`);
	}

	ability(ability: Ability) {
		return this.page.getByTestId(`${ability}-ability`);
	}

	weaponPoolItem(weaponName: string) {
		return this.page.getByRole("listitem").getByText(weaponName);
	}

	async selectGear(type: GearType, name: string) {
		await this.gearSelect(type).click();
		await this.page.getByPlaceholder("Search gear...").fill(name);
		await this.page
			.getByRole("listbox", { name: "Suggestions" })
			.getByTestId(`gear-select-option-${name}`)
			.click();
	}

	async addAbility(ability: Ability, times = 1) {
		for (let i = 0; i < times; i++) {
			await this.page.getByTestId(`${ability}-ability-button`).click();
		}
	}
}
