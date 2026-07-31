import type { Page } from "@playwright/test";
import { createTeamSchema } from "~/features/team/team-schemas";
import { NEW_TEAM_PAGE } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

export class NewTeamPage {
	private readonly page: Page;
	readonly form;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, createTeamSchema);
	}

	async goto() {
		await navigate({ page: this.page, url: NEW_TEAM_PAGE });
	}
}
