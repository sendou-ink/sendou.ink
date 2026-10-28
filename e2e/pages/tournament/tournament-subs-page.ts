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

	/** Text of a sub post, e.g. its poster's name or message. */
	subPostText(text: string) {
		// the poster's name is also in the side nav (as the logged in user) and
		// in the closed mobile "You" panel
		return this.page
			.getByRole("main")
			.getByText(text)
			.filter({ visible: true });
	}

	/** A weapon of a sub post's player, from their match profile. */
	weaponImage(weaponName: string) {
		return this.page
			.getByRole("main")
			.getByRole("img", { name: weaponName })
			.filter({ visible: true });
	}

	openAddPostDialog() {
		return this.locators.addPostButton.click();
	}

	/** Deletes the only sub post offering a delete button, confirming the dialog. */
	async deleteOwnPost() {
		await this.page.getByRole("button", { name: "Delete" }).click();
		await modalClickConfirmButton(this.page);
	}
}
