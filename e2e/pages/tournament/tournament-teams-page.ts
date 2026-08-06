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
			teamMemberNames: page.getByTestId("team-member-name"),
		};
	}

	async goto(tournamentId: number) {
		await navigate({ page: this.page, url: tournamentTeamsPage(tournamentId) });
	}

	memberNamed(name: string) {
		return this.locators.teamMemberNames.getByText(name);
	}

	teamNamed(name: string) {
		return this.locators.teamNames.getByText(name);
	}
}
