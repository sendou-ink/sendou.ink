import type { Page } from "@playwright/test";
import { tournamentRulesPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { TournamentNav } from "./tournament-nav";

/** `/to/:id/rules`, showing the tournament's map pool. */
export class TournamentRulesPage {
	private readonly page: Page;
	readonly nav;

	constructor(page: Page) {
		this.page = page;
		this.nav = new TournamentNav(page);
	}

	async goto(tournamentId: number) {
		await navigate({ page: this.page, url: tournamentRulesPage(tournamentId) });
	}

	stageName(stage: string) {
		return this.page.getByText(stage, { exact: true });
	}

	modeImage(mode: string) {
		return this.page.getByAltText(mode);
	}
}
