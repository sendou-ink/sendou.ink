import type { Page } from "@playwright/test";
import { tournamentPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { TournamentNav } from "./tournament-nav";
import { TournamentRegisterPage } from "./tournament-register-page";

export class TournamentPage {
	private readonly page: Page;
	readonly nav;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.nav = new TournamentNav(page);
		this.locators = {
			registerCta: page.getByTestId("register-cta"),
		};
	}

	async goto(tournamentId: number) {
		await navigate({ page: this.page, url: tournamentPage(tournamentId) });
	}

	heading(name: string) {
		return this.page.getByRole("heading", { level: 1, name });
	}

	nameHeading(name: string) {
		return this.page.getByRole("heading", { level: 1, name });
	}

	async register() {
		await this.locators.registerCta.click();
		return new TournamentRegisterPage(this.page);
	}
}
