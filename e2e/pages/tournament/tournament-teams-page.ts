import type { Page } from "@playwright/test";
import { tournamentTeamsPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

export class TournamentTeamsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			teamNames: page.getByTestId("team-name"),
		};
	}

	async goto(tournamentId: number) {
		await navigate({ page: this.page, url: tournamentTeamsPage(tournamentId) });
	}
}
