import type { Page } from "@playwright/test";
import { editSuggestionFormSchema } from "~/features/plus-suggestions/plus-suggestions-schemas";
import { plusSuggestionPage } from "~/features/plus-suggestions/plus-suggestions-urls";
import {
	modalClickConfirmButton,
	navigate,
	submit,
} from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

export class PlusSuggestionsPage {
	private readonly page: Page;
	readonly editForm;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.editForm = createFormHelpers(page, editSuggestionFormSchema);
		this.locators = {
			noSuggestions: page.getByText("No suggestions yet"),
			noPermissionsAlert: page.getByText(
				"You do not have permissions to suggest or suggesting is not possible right now",
			),
			commentLink: page.getByRole("link", { name: "Comment", exact: true }),
			/** Deletes the user's own suggestion of themselves, one button per tier. */
			deleteOwnSuggestionButton: page.getByRole("button", {
				name: "Delete",
				exact: true,
			}),
		};
	}

	async goto(tier?: number) {
		await navigate({ page: this.page, url: plusSuggestionPage({ tier }) });
	}

	suggestedUser(username: string) {
		return this.page.getByRole("heading", { name: username });
	}

	commentsSummary(count: number) {
		return this.page.getByText(`Comments (${count})`);
	}

	async openComments(count: number) {
		const details = this.page
			.locator("details")
			.filter({ has: this.commentsSummary(count) });
		if ((await details.getAttribute("open")) === null) {
			await this.commentsSummary(count).click();
		}
	}

	comment(text: string) {
		return this.page.locator("fieldset").filter({ hasText: text });
	}

	async editComment(currentText: string, newText: string) {
		await this.comment(currentText).getByLabel("Edit").click();
		await this.editForm.fill("comment", newText);
		await submit(this.page);
	}

	async deleteComment(text: string) {
		await this.comment(text).getByLabel("Delete comment").click();
		await modalClickConfirmButton(this.page);
	}

	async deleteOwnSuggestion() {
		await this.locators.deleteOwnSuggestionButton.click();
		await modalClickConfirmButton(this.page);
	}
}
