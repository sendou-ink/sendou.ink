import type { Page } from "@playwright/test";
import { followUpCommentFormSchema } from "~/features/plus-suggestions/plus-suggestions-schemas";
import { plusSuggestionCommentPage } from "~/features/plus-suggestions/plus-suggestions-urls";
import { navigate, submit } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

/** The follow-up comment dialog, a child route of the suggestions page. */
export class SuggestionCommentPage {
	private readonly page: Page;
	readonly form;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, followUpCommentFormSchema);
	}

	async goto({ tier, userId }: { tier: number; userId: number }) {
		await navigate({
			page: this.page,
			url: plusSuggestionCommentPage({ tier, userId }),
		});
	}

	heading({ username, tier }: { username: string; tier: number }) {
		return this.page.getByRole("heading", {
			name: `${username}'s +${tier} suggestion`,
		});
	}

	async comment(text: string) {
		await this.form.fill("comment", text);
		await submit(this.page);
	}
}
