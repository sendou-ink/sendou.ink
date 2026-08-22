import type { Page } from "@playwright/test";
import { newSuggestionFormSchema } from "~/features/plus-suggestions/plus-suggestions-schemas";
import { plusSuggestionsNewPage } from "~/features/plus-suggestions/plus-suggestions-urls";
import { navigate, submit } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

/** The "Adding a new suggestion" dialog, a child route of the suggestions page. */
export class NewSuggestionPage {
	private readonly page: Page;
	readonly form;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, newSuggestionFormSchema);
		this.locators = {
			heading: page.getByRole("heading", { name: "Adding a new suggestion" }),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: plusSuggestionsNewPage() });
	}

	async suggest({ username, comment }: { username: string; comment: string }) {
		await this.form.selectUser("userId", username);
		await this.form.fill("comment", comment);
		await submit(this.page);
	}
}
