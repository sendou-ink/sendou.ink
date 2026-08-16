import type { Page } from "@playwright/test";
import { userResultsPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

/** `/u/:identifier/results` */
export class UserResultsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			tournamentNameCells: page.getByTestId("tournament-name-cell"),
			matesButtons: page.getByTestId("mates-button"),
		};
	}

	async goto(discordId: string) {
		await navigate({ page: this.page, url: userResultsPage({ discordId }) });
	}

	tournamentName(name: string) {
		return this.locators.tournamentNameCells.getByText(name);
	}

	async openMates(nth: number) {
		await this.locators.matesButtons.nth(nth).click();
	}

	/** The teammates listed for the `nth` expanded result row. */
	matesListItems(nth: number) {
		return this.page.locator(`[data-testid="mates-cell-placement-${nth}"] li`);
	}
}
