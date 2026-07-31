import type { Page } from "@playwright/test";
import { tournamentTeamPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

export class TournamentTeamPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			memberNames: page.getByTestId("team-member-name"),
		};
	}

	async goto(tournamentId: number, tournamentTeamId: number) {
		await navigate({
			page: this.page,
			url: tournamentTeamPage({ tournamentId, tournamentTeamId }),
		});
	}
}
