import type { Page } from "@playwright/test";
import { navigate, submit } from "../../helpers/playwright";
import { TeamPage } from "./team-page";

export class JoinTeamPage {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	/** Takes the whole invite link as shown on the roster page. */
	async goto(inviteLink: string) {
		await navigate({ page: this.page, url: inviteLink });
	}

	async join() {
		await submit(this.page);
		return new TeamPage(this.page);
	}
}
