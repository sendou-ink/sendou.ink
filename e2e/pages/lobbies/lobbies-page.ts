import type { Page } from "@playwright/test";
import { lobbiesPage } from "~/utils/urls";
import { navigate, waitForPOSTResponse } from "../../helpers/playwright";

/** The lobby list: running, upcoming and ended lobbies as cards. */
export class LobbiesPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			cards: page.getByTestId("lobby-card"),
		};
	}

	/** Opens the lobby list. */
	async goto() {
		await navigate({ page: this.page, url: lobbiesPage() });
	}

	/** The card of the lobby with the name. */
	card(name: string) {
		return this.locators.cards.filter({ hasText: name });
	}

	/** Signs up for the lobby straight from its card. */
	async join(name: string) {
		await waitForPOSTResponse(this.page, () =>
			this.card(name).getByTestId("lobby-join-button").click(),
		);
	}
}
