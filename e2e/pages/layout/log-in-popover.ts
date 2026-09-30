import type { Page } from "@playwright/test";

/** Shown when a logged out visitor uses a control that requires an account. */
export class LogInPopover {
	readonly locators;

	constructor(page: Page) {
		this.locators = {
			logInButton: page.getByTestId("log-in-popover-button"),
		};
	}
}
