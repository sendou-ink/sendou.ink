import type { Page } from "@playwright/test";
import { clickNavTab } from "../../helpers/playwright";
import { TournamentAdminPage } from "./tournament-admin-page";
import { TournamentBracketsPage } from "./tournament-brackets-page";
import { TournamentResultsPage } from "./tournament-results-page";

/** Tabs shared by every tournament page, some of which collapse into a "More" menu. */
export class TournamentNav {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			teamsTab: page.locator('[data-testid="teams-tab"]:visible'),
		};
	}

	async openBrackets() {
		await clickNavTab(this.page, "brackets-tab");
		return new TournamentBracketsPage(this.page);
	}

	async openAdmin() {
		await clickNavTab(this.page, "admin-tab");
		return new TournamentAdminPage(this.page);
	}

	async openResults() {
		await clickNavTab(this.page, "results-tab");
		return new TournamentResultsPage(this.page);
	}
}
