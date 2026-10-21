import type { Page } from "@playwright/test";
import { newLobbySchema } from "~/features/lobbies/lobbies-schemas";
import { newLobbyPage } from "~/utils/urls";
import { navigate, submit } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

export class NewLobbyPage {
	private readonly page: Page;
	readonly form;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, newLobbySchema);
	}

	async goto() {
		await navigate({ page: this.page, url: newLobbyPage() });
	}

	async save() {
		await submit(this.page);
	}
}
