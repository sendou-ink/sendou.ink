import type { Page } from "@playwright/test";
import { newLobbySchema } from "~/features/lobbies/lobbies-schemas";
import { newLobbyPage } from "~/utils/urls";
import { navigate, submit } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

/** The form making a new lobby. */
export class NewLobbyPage {
	private readonly page: Page;
	readonly form;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, newLobbySchema);
		this.locators = {
			friendCodeNeededText: page.getByText(
				"Set your friend code to make a lobby.",
			),
		};
	}

	/** Opens the new lobby form. */
	async goto() {
		await navigate({ page: this.page, url: newLobbyPage() });
	}

	/** Makes the lobby, the maker becoming its host. */
	async save() {
		await submit(this.page);
	}
}
