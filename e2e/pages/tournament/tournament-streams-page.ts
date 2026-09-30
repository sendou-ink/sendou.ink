import type { Page } from "@playwright/test";
import { tournamentStreamsPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

/** `/to/:id/streams` */
export class TournamentStreamsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			streams: page.getByTestId("tournament-stream"),
		};
	}

	async goto(tournamentId: number) {
		await navigate({
			page: this.page,
			url: tournamentStreamsPage(tournamentId),
		});
	}

	viewerCount(count: number) {
		return this.page.getByText(String(count));
	}
}
