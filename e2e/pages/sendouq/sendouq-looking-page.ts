import type { Page } from "@playwright/test";
import {
	SENDOUQ_LOOKING_PAGE,
	SENDOUQ_LOOKING_PREVIEW_PAGE,
} from "~/utils/urls";
import { navigate, submit } from "../../helpers/playwright";
import { GroupCard } from "./group-card";

export class SendouQLookingPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			groupCards: page.getByTestId("sendouq-group-card"),
			undoButtons: page.getByRole("button", { name: "Undo" }),
			actionButtons: page.getByTestId("group-card-action-button"),
			suggestButtons: page.getByTestId("group-card-suggest-button"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: SENDOUQ_LOOKING_PAGE });
	}

	/** Opens the supporter only view of the queue, without being in it. */
	async gotoPreview() {
		await navigate({ page: this.page, url: SENDOUQ_LOOKING_PREVIEW_PAGE });
	}

	/** The own group's card, always the first one on the page. */
	get ownGroupCard() {
		return this.groupCard(0);
	}

	groupCard(nth: number) {
		return new GroupCard(this.locators.groupCards.nth(nth));
	}

	/**
	 * Presses the action another group's card offers: challenging or inviting it,
	 * accepting what it offered, or undoing either.
	 */
	async pressGroupAction() {
		await submit(this.page, "group-card-action-button");
	}
}
