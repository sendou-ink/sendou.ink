import type { Page } from "@playwright/test";
import { tournamentPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { TournamentRegisterPage } from "./tournament-register-page";

export class TournamentPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			registerCta: page.getByTestId("register-cta"),
		};
	}

	async goto(tournamentId: number) {
		await navigate({ page: this.page, url: tournamentPage(tournamentId) });
	}

	async register() {
		await this.locators.registerCta.click();
		return new TournamentRegisterPage(this.page);
	}
}
