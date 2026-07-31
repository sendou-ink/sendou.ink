import type { Page } from "@playwright/test";
import {
	clockFormatSchema,
	disableBuildAbilitySortingSchema,
	spoilerFreeModeSchema,
} from "~/features/settings/settings-schemas";
import { SETTINGS_PAGE } from "~/utils/urls";
import {
	expectIsHydrated,
	navigate,
	waitForPOSTResponse,
} from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

type SettingsTab = "preferences" | "locale" | "theme";

/** `/settings` preference toggles and the theme tab; the match profile tab has its own page object. */
export class SettingsPage {
	private readonly page: Page;
	readonly locators;
	private readonly buildAbilitySortingForm;
	private readonly clockFormatForm;
	private readonly spoilerFreeModeForm;

	constructor(page: Page) {
		this.page = page;
		this.buildAbilitySortingForm = createFormHelpers(
			page,
			disableBuildAbilitySortingSchema,
		);
		this.clockFormatForm = createFormHelpers(page, clockFormatSchema);
		this.spoilerFreeModeForm = createFormHelpers(page, spoilerFreeModeSchema);
		this.locators = {
			baseHueSlider: page.locator("#base-hue"),
			saveThemeButton: page.getByRole("button", { name: "Save" }).first(),
			resetThemeButton: page.getByRole("button", { name: "Reset" }).first(),
		};
	}

	async goto(tab: SettingsTab) {
		await navigate({ page: this.page, url: `${SETTINGS_PAGE}?tab=${tab}` });
	}

	async disableBuildAbilitySorting() {
		await this.goto("preferences");
		await waitForPOSTResponse(this.page, () =>
			this.buildAbilitySortingForm.check("newValue"),
		);
	}

	async setClockFormat(format: "12h" | "24h") {
		await this.goto("locale");
		await waitForPOSTResponse(this.page, () =>
			this.clockFormatForm.select("newValue", format),
		);
	}

	async enableSpoilerFreeMode() {
		await this.goto("preferences");
		await waitForPOSTResponse(this.page, () =>
			this.spoilerFreeModeForm.check("newValue"),
		);
	}

	async setBaseHue(value: string) {
		await this.locators.baseHueSlider.fill(value);
	}

	async saveTheme() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.saveThemeButton.click(),
		);
	}

	async resetTheme() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.resetThemeButton.click(),
		);
	}

	hasCustomTheme() {
		return this.page
			.locator("html")
			.evaluate((el) => el.style.getPropertyValue("--_base-h") !== "");
	}

	async reload() {
		await this.page.reload();
		await expectIsHydrated(this.page);
	}
}
