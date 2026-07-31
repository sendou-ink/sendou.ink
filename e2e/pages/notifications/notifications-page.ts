import type { Page } from "@playwright/test";
import { NOTIFICATIONS_URL } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

/** `/notifications` */
export class NotificationsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			heading: this.page.getByRole("heading", { name: "Notifications" }),
			items: this.page.getByTestId("notification-item"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: NOTIFICATIONS_URL });
	}
}
