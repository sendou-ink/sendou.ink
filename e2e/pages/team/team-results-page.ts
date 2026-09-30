import type { Page } from "@playwright/test";

export class TeamResultsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			table: page.getByRole("table"),
		};
	}

	resultRow(tournamentName: string) {
		return this.locators.table
			.getByRole("row")
			.filter({ has: this.page.getByRole("link", { name: tournamentName }) });
	}

	/** The medal icon of the row, named by the placement ordinal e.g. "1st". */
	placement(tournamentName: string, placementText: string) {
		return this.resultRow(tournamentName).getByRole("img", {
			name: placementText,
		});
	}
}
