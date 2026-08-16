import type { Page } from "@playwright/test";

/** Where a banned user ends up no matter which page they try to visit. */
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

	reason(reason: string) {
		return this.page.getByText(`Reason: ${reason}`);
	}
}
