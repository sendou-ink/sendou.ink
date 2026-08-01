import type { Page } from "@playwright/test";
import { tournamentSubsPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

/** `/to/:id/looking` — the subs list shown once registration has closed. */
export class TournamentSubsPage {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async goto(tournamentId: number) {
		await navigate({ page: this.page, url: tournamentSubsPage(tournamentId) });
	}

	subPostText(text: string) {
		return this.page.getByText(text);
	}
}
