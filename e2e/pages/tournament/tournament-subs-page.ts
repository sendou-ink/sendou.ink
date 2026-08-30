import type { Page } from "@playwright/test";
import { addSubFormSchema } from "~/features/tournament-lfg/tournament-lfg-schemas";
import { tournamentSubsPage } from "~/utils/urls";
import { modalClickConfirmButton, navigate } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

/** `/to/:id/looking` — the subs list shown once registration has closed. */
export class TournamentSubsPage {
	private readonly page: Page;
	readonly addSubForm;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.addSubForm = createFormHelpers(page, addSubFormSchema);
		this.locators = {
			addPostButton: page.getByRole("button", {
				name: "Add yourself as sub",
			}),
			addPostDialogHeading: page.getByRole("heading", {
				name: "Add yourself as sub",
			}),
			noPostsText: page.getByText("No subs available"),
		};
	}

	async goto(tournamentId: number) {
		await navigate({ page: this.page, url: tournamentSubsPage(tournamentId) });
	}

	subPostText(text: string) {
		return this.page.getByText(text);
	}

	openAddPostDialog() {
		return this.locators.addPostButton.click();
	}

	async deleteOwnPost() {
		await this.page.getByRole("button", { name: "Delete" }).click();
		await modalClickConfirmButton(this.page);
	}
}
