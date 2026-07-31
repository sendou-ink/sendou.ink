import type { Page } from "@playwright/test";
import { scrimsNewFormSchema } from "~/features/scrims/scrims-schemas";
import { newScrimPostPage } from "~/utils/urls";
import {
	navigate,
	selectTournament,
	selectUser,
	submit,
} from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

export class NewScrimPostPage {
	private readonly page: Page;
	readonly form;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, scrimsNewFormSchema);
	}

	async goto() {
		await navigate({ page: this.page, url: newScrimPostPage() });
	}

	/** Posts as a pick-up instead of as a team, the author being its first user. */
	async selectPickupUsers(userNames: string[]) {
		await this.page.getByLabel("With").selectOption("PICKUP");

		for (const [index, userName] of userNames.entries()) {
			await selectUser({
				page: this.page,
				labelName: `User ${index + 2}`,
				userName,
			});
		}
	}

	/** Limits who sees the post to one of the author's associations. */
	async selectVisibility(associationName: string) {
		await this.page
			.getByLabel("Visibility")
			.selectOption({ label: associationName });
	}

	async selectTournamentMaps(tournamentName: string) {
		await this.form.select("maps", "TOURNAMENT");
		await selectTournament({ page: this.page, query: tournamentName });
	}

	async save() {
		await submit(this.page);
	}
}
