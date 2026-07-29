import type { Page } from "@playwright/test";
import { tournamentBracketsPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

export class TournamentBracketsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			bracketsViewer: page.getByTestId("brackets-viewer"),
		};
	}

	async goto(tournamentId: number) {
		await navigate({
			page: this.page,
			url: tournamentBracketsPage({ tournamentId }),
		});
	}

	teamName(name: string) {
		return this.page.getByText(name);
	}
}
