import type { Page } from "@playwright/test";
import type { ModeShort } from "~/modules/in-game-lists/types";

type PreferenceLabel = "Avoid" | "Neutral" | "Prefer";
type SortOrder = "DEFAULT" | "BEST" | "WORST";

/** The map/mode preferences field shared by the settings match profile tab and the team edit page. */
export class MapModePreferencesField {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async setModePreference(mode: ModeShort, preference: PreferenceLabel) {
		await this.page
			.locator(
				`label[for="chip-radio-mode-preference-${mode}-${preference.toUpperCase()}"]`,
			)
			.click();
	}

	preferenceRadio(mode: ModeShort, preference: PreferenceLabel) {
		return this.page
			.getByRole("radiogroup", { name: `Select preference towards ${mode}` })
			.getByRole("radio", { name: preference });
	}

	async selectModeTab(mode: ModeShort) {
		await this.page.getByTestId(`map-pool-mode-tab-${mode}`).click();
	}

	mapButton(mode: ModeShort, stageId: number) {
		return this.page.getByTestId(`map-pool-${mode}-${stageId}`);
	}

	/** The map cards of a mode in the order they are shown. */
	mapCards(mode: ModeShort) {
		return this.page.locator(`[data-testid^="map-pool-${mode}-"]`);
	}

	modeRow(mode: ModeShort) {
		return this.page.getByTestId(`mode-preference-row-${mode}`);
	}

	async sortMaps(order: SortOrder) {
		await this.page
			.locator(`label[for="chip-radio-map-pool-sort-${order}"]`)
			.click();
	}

	poolSlot(stageName: string) {
		return this.page.getByRole("button", { name: `Remove ${stageName}` });
	}

	bannedMapsToggle() {
		return this.page.getByText(/maps? banned in this mode/);
	}

	bannedMap(stageName: string) {
		return this.page.locator("details").getByText(stageName);
	}
}
