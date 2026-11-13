import type { Page } from "@playwright/test";
import { tournamentAdminPage } from "~/utils/urls";
import { navigate, submit } from "../../helpers/playwright";

/** `/to/:id/admin/stations` — the LAN stations form. */
export class TournamentAdminStationsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			nameInputs: page.getByRole("textbox", { name: /^Name/ }),
			locationNoteInputs: page.getByLabel("Location note"),
			autoAssignSwitch: page.getByRole("switch", {
				name: "Auto-assign stations",
			}),
			addStationButton: page.getByRole("button", { name: "Add", exact: true }),
			removeStationButtons: page.getByTestId("stations-remove-item-button"),
		};
	}

	async goto(tournamentId: number) {
		await navigate({
			page: this.page,
			url: `${tournamentAdminPage(tournamentId)}/stations`,
		});
	}

	/** An empty array field already renders one placeholder station to fill. */
	async fillStation(
		nth: number,
		{ name, locationNote }: { name: string; locationNote?: string },
	) {
		await this.locators.nameInputs.nth(nth).fill(name);
		if (locationNote) {
			await this.locators.locationNoteInputs.nth(nth).fill(locationNote);
		}
	}

	async addStation() {
		await this.locators.addStationButton.click();
	}

	async removeStation(nth: number) {
		await this.locators.removeStationButtons.nth(nth).click();
	}

	save() {
		return submit(this.page, "save-stations-button");
	}
}
