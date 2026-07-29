import type { Page } from "@playwright/test";
import { updateMatchProfileSchema } from "~/features/settings/match-profile-schemas";
import { MATCH_PROFILE_PAGE } from "~/utils/urls";
import { navigate, submit } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

export class MatchProfilePage {
	private readonly page: Page;
	readonly form;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, updateMatchProfileSchema);
	}

	async goto() {
		await navigate({ page: this.page, url: MATCH_PROFILE_PAGE });
	}

	async save() {
		await submit(this.page);
	}
}
