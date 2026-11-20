import type { Page } from "@playwright/test";
import { SUSPENDED_PAGE } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

/** `/suspended`, where a banned user ends up no matter which page they try to visit. */
export class SuspendedPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			heading: page.getByText("Account suspended"),
			endsAt: page.getByText("Ends:"),
			noEndTime: page.getByText("no end time set"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: SUSPENDED_PAGE });
	}

	/** The reason the ban was given for, as shown to the banned user. */
	reason(reason: string | RegExp) {
		return this.page.getByText(
			typeof reason === "string" ? `Reason: ${reason}` : reason,
		);
	}
}
