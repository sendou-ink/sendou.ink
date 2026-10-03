import type { Page } from "@playwright/test";
import type { DamageType } from "~/features/build-analyzer/analyzer-types";
import type { DamageReceiver } from "~/features/object-damage-calculator/calculator-types";
import { OBJECT_DAMAGE_CALCULATOR_URL } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

export class ObjectDamageCalculatorPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			weaponLanding: page.getByTestId("weapon-landing"),
			backToWeaponLandingLink: page
				.getByRole("main")
				.getByRole("link", { name: "Back", exact: true }),
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

	/** Picks a weapon from the landing shown when no weapon is selected yet */
	async pickWeapon(name: string) {
		const { weaponLanding } = this.locators;
		await weaponLanding.getByRole("textbox").fill(name);
		await weaponLanding.getByText(name, { exact: true }).click();
	}

	async changeWeapon(name: string) {
		await this.locators.backToWeaponLandingLink.click();
		await this.pickWeapon(name);
	}

	async selectDamageType(damageType: DamageType) {
		await this.page
			.locator(`label[for="chip-radio-damage-${damageType}"]`)
			.click();
	}

	async selectAbilityPoints(abilityPoints: number) {
		await this.locators.abilityPointsSelect.selectOption(String(abilityPoints));
	}

	async toggleMultiplier() {
		await this.locators.multiplierSwitch.click();
	}
}
