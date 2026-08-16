import type { Page } from "@playwright/test";
import type { DamageReceiver } from "~/features/object-damage-calculator/calculator-types";
import { OBJECT_DAMAGE_CALCULATOR_URL } from "~/utils/urls";
import { navigate, selectWeapon } from "../../helpers/playwright";

export class ObjectDamageCalculatorPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			damageTypeSelect: page.locator("text=Damage type"),
			abilityPointsSelect: page.locator("text=Amount of"),
			multiplierSwitch: page.getByTestId("multi-switch"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: OBJECT_DAMAGE_CALCULATOR_URL });
	}

	hitPoints(receiver: DamageReceiver = "Chariot") {
		return this.page.getByTestId(`hp-${receiver}`);
	}

	damage(receiver: DamageReceiver = "Chariot") {
		return this.page.getByTestId(`dmg-${receiver}`);
	}

	hitsToDestroy(receiver: DamageReceiver = "Chariot") {
		return this.page.getByTestId(`htd-${receiver}`);
	}

	async selectWeapon(name: string) {
		await selectWeapon({ page: this.page, name });
	}

	async selectDamageType(damageType: string) {
		await this.locators.damageTypeSelect.selectOption(damageType);
	}

	async selectAbilityPoints(abilityPoints: number) {
		await this.locators.abilityPointsSelect.selectOption(String(abilityPoints));
	}

	async toggleMultiplier() {
		await this.locators.multiplierSwitch.click();
	}
}
