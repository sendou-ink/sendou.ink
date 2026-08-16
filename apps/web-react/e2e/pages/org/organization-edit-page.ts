import type { Page } from "@playwright/test";
import type { TournamentOrganizationRole } from "~/features/tournament-organization/tournament-organization-constants";
import { tournamentOrganizationEditPage } from "~/features/tournament-organization/tournament-organization-urls";
import { navigate, submit } from "../../helpers/playwright";

export class OrganizationEditPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			title: page.getByText("Editing tournament organization"),
		};
	}

	async goto(organizationSlug: string) {
		await navigate({
			page: this.page,
			url: tournamentOrganizationEditPage(organizationSlug),
		});
	}

	/** The members array field renders one fieldset per member, identified by the selected user. */
	memberFieldset(username: string) {
		return this.page.locator(`fieldset:has(button:has-text("${username}"))`);
	}

	async setMemberRole(username: string, role: TournamentOrganizationRole) {
		await this.memberFieldset(username)
			.getByLabel("Role", { exact: true })
			.selectOption(role);
	}

	async save() {
		await submit(this.page);
	}
}
