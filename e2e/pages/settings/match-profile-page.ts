import type { Page } from "@playwright/test";
import { updateMatchProfileSchema } from "~/features/settings/match-profile-schemas";
import type { ModeShort } from "~/modules/in-game-lists/types";
import { MATCH_PROFILE_PAGE } from "~/utils/urls";
import { navigate, submit } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

export const SELECTED_MAP_CLASS = /mapButtonGreyedOut/;

export class MatchProfilePage {
	private readonly page: Page;
	readonly form;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, updateMatchProfileSchema);
		this.locators = {
			avoidedModePoolError: page.getByText(
				"Can't have map pool for a mode that was avoided",
			),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: MATCH_PROFILE_PAGE });
	}

	async setModePreference(
		mode: ModeShort,
		preference: "Avoid" | "Neutral" | "Prefer",
	) {
		const name =
			preference === "Neutral"
				? "Neutral towards the mode"
				: `${preference} the mode`;
		// the selected-state icon overlays the radio and intercepts clicks
		await this.page
			.getByRole("radiogroup", { name: `Select preference towards ${mode}` })
			.getByRole("radio", { name })
			.click({ force: true });
	}

	async selectModeTab(mode: ModeShort) {
		await this.page.getByTestId(`map-pool-mode-tab-${mode}`).click();
	}

	mapButton(mode: ModeShort, stageId: number) {
		return this.page.getByTestId(`map-pool-${mode}-${stageId}`);
	}

	async save() {
		await submit(this.page);
	}
}
