import type { Page } from "@playwright/test";
import type { ModeShort } from "~/modules/in-game-lists/types";

export const SELECTED_MAP_CLASS = /mapButtonGreyedOut/;

type PreferenceLabel = "Avoid" | "Neutral" | "Prefer";

/** The map/mode preferences field shared by the settings match profile tab and the team edit page. */
export class MapModePreferencesField {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async setModePreference(mode: ModeShort, preference: PreferenceLabel) {
		// the selected-state icon overlays the radio and intercepts clicks
		await this.preferenceRadio(mode, preference).click({ force: true });
	}

	preferenceRadio(mode: ModeShort, preference: PreferenceLabel) {
		const name =
			preference === "Neutral"
				? "Neutral towards the mode"
				: `${preference} the mode`;
		return this.page
			.getByRole("radiogroup", { name: `Select preference towards ${mode}` })
			.getByRole("radio", { name });
	}

	async selectModeTab(mode: ModeShort) {
		await this.page.getByTestId(`map-pool-mode-tab-${mode}`).click();
	}

	mapButton(mode: ModeShort, stageId: number) {
		return this.page.getByTestId(`map-pool-${mode}-${stageId}`);
	}
}
