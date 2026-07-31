import type { Page } from "@playwright/test";
import { editTeamFormSchema } from "~/features/team/team-schemas";
import { editTeamPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

export class TeamEditPage {
	private readonly page: Page;
	readonly form;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, editTeamFormSchema, {
			submitTestId: "edit-team-submit-button",
		});
	}

	async goto(customUrl: string) {
		await navigate({ page: this.page, url: editTeamPage(customUrl) });
	}
}
