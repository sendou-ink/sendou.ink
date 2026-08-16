import type { Page } from "@playwright/test";
import { editTeamFormSchema } from "~/features/team/team-schemas";
import { editTeamPage } from "~/utils/urls";
import {
	modalClickConfirmButton,
	navigate,
	submit,
} from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";
import { MapModePreferencesField } from "../settings/map-mode-preferences-field";

export class TeamEditPage {
	private readonly page: Page;
	readonly form;
	readonly maps;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, editTeamFormSchema, {
			submitTestId: "edit-team-submit-button",
		});
		this.maps = new MapModePreferencesField(page);
		this.locators = {
			removeMapPreferencesButton: page.getByRole("button", {
				name: "Remove team map preferences",
			}),
		};
	}

	async goto(customUrl: string) {
		await navigate({ page: this.page, url: editTeamPage(customUrl) });
	}

	async saveMapPreferences() {
		await submit(this.page, "team-map-preferences-submit-button");
	}

	async removeMapPreferences() {
		await this.locators.removeMapPreferencesButton.click();
		await modalClickConfirmButton(this.page);
	}
}
