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

type SettingsTab = "preferences" | "locale" | "theme" | "sounds";

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
			buildAbilitySortingToggle: page.getByLabel(
				this.buildAbilitySortingForm.getLabel("newValue"),
			),
			baseHueSlider: page.locator("#base-hue"),
			saveThemeButton: page.getByRole("button", { name: "Save" }).first(),
			resetThemeButton: page.getByRole("button", { name: "Reset" }).first(),
			// matches both the English and the Japanese label so the language test
			// can switch back after leaving the UI in Japanese
			pageHeading: page.getByRole("heading", { name: /^(Settings|設定)$/ }),
			languageSelect: page.getByLabel(/^(Language|言語) *$/),
			themeSelect: page.getByRole("combobox", { name: "Theme" }),
			htmlRoot: page.locator("html"),
			volumeSlider: page.getByRole("slider"),
			logOutButton: page.getByRole("button", { name: "Log out" }),
		};
	}

	async goto(tab?: SettingsTab) {
		await navigate({
			page: this.page,
			url: tab ? `${SETTINGS_PAGE}?tab=${tab}` : SETTINGS_PAGE,
		});
	}

	/** Submits the log out form; a native form POST followed by a redirect to the front page. */
	async logOut() {
		await this.locators.logOutButton.click();
		await this.page.waitForURL("/");
		await expectIsHydrated(this.page);
	}

	async selectTab(
		name: "Match profile" | "Preferences" | "Locale" | "Theme" | "Sounds",
	) {
		await this.page.getByRole("tab", { name }).click();
	}

	async disableBuildAbilitySorting() {
		await this.goto("preferences");
		await this.checkDisableBuildAbilitySortingToggle();
	}

	/** Checks the toggle on an already open preferences tab. */
	async checkDisableBuildAbilitySortingToggle() {
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

	/** Selects an interface language on the locale tab by its native name. */
	async selectLanguage(name: "English" | "日本語") {
		await this.locators.languageSelect.selectOption({ label: name });
	}

	/** Selects dark/light/auto on the theme tab; persisted via a POST to /theme. */
	async setTheme(theme: "Auto" | "Dark" | "Light") {
		await waitForPOSTResponse(this.page, async () => {
			await this.locators.themeSelect.selectOption({ label: theme });
		});
	}

	soundCheckbox(name: string) {
		return this.page.getByRole("checkbox", { name });
	}

	async setSoundVolume(value: string) {
		await this.locators.volumeSlider.fill(value);
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
