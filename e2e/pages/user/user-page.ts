import type { Page } from "@playwright/test";
import { userPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { TeamPage } from "../team/team-page";

export class UserPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			mainTeamLink: page.getByTestId("main-team-link"),
			secondaryTeamsTrigger: page.getByTestId("secondary-team-trigger"),
		};
	}

	async goto(discordId: string) {
		await navigate({ page: this.page, url: userPage({ discordId }) });
	}

	async openMainTeam() {
		await this.locators.mainTeamLink.click();
		return new TeamPage(this.page);
	}
}
