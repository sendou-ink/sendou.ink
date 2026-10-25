import type { Page } from "@playwright/test";
import { lobbiesPage } from "~/utils/urls";
import {
	modalClickConfirmButton,
	navigate,
	waitForPOSTResponse,
} from "../../helpers/playwright";

/** The lobby list: running, upcoming and ended lobbies as cards. */
export class LobbiesPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			cards: page.getByTestId("lobby-card"),
			selectedTab: page.getByRole("tab", { selected: true }),
		};
	}

	/** Opens the lobby list. */
	async goto() {
		await navigate({ page: this.page, url: lobbiesPage() });
	}

	/** Switches to the tab of running, upcoming or ended lobbies. */
	async openTab(tab: "running" | "upcoming" | "ended") {
		await this.page.getByTestId(`lobbies-${tab}-tab`).click();
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

	/** Leaves the lobby straight from its card, through the confirmation dialog. */
	async leave(name: string) {
		await this.card(name).getByTestId("lobby-leave-button").click();
		await modalClickConfirmButton(this.page);
	}

	/** The lock marking a card's lobby as visible only to some. */
	limitedVisibilityIcon(name: string) {
		return this.card(name).getByLabel("Limited visibility");
	}
}
