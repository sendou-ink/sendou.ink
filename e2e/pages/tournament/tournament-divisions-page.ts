import type { Page } from "@playwright/test";
import { tournamentDivisionsPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { TournamentBracketsPage } from "./tournament-brackets-page";

/** `/to/:id/divisions` — a league's divisions, each linking to its brackets. */
export class TournamentDivisionsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			divisionLinks: page.getByTestId("division-link"),
		};
	}

	async goto(tournamentId: number) {
		await navigate({
			page: this.page,
			url: tournamentDivisionsPage(tournamentId),
		});
	}

	divisionLink(name: string) {
		return this.page.getByRole("link", { name });
	}

	async openDivision(name: string) {
		await this.divisionLink(name).click();
		return new TournamentBracketsPage(this.page);
	}
}
