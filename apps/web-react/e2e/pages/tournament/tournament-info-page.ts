import type { Page } from "@playwright/test";
import { tournamentInfoPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { TournamentNav } from "./tournament-nav";

/** `/to/:id/info` */
export class TournamentInfoPage {
	private readonly page: Page;
	readonly nav;

	constructor(page: Page) {
		this.page = page;
		this.nav = new TournamentNav(page);
	}

	async goto(tournamentId: number) {
		await navigate({ page: this.page, url: tournamentInfoPage(tournamentId) });
	}

	/** Matched on the machine-readable ISO attribute, making it timezone-agnostic. */
	startTime(date: Date) {
		return this.page.locator(`time[datetime="${date.toISOString()}"]`);
	}
}
