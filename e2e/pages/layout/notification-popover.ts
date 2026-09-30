import type { Page } from "@playwright/test";
import { NotificationsPage } from "../notifications/notifications-page";

/** The notification bell of the layout, and the popover it opens. */
export class NotificationPopover {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			openButton: this.page.getByTestId("notifications-button"),
			// the list is rendered while closed too (and once more in the closed
			// mobile "You" panel), so only what shows counts
			items: this.page
				.getByTestId("notification-item")
				.filter({ visible: true }),
			seeAllLink: this.page
				.getByTestId("notifications-see-all-button")
				.filter({ visible: true }),
			/** Shown on the bell while unseen notifications exist. */
			bellDot: this.page.getByTestId("notifications-bell-dot"),
			/** Per notification, marking it as one the user has not read yet. */
			unseenDots: this.page
				.getByTestId("notification-unseen-dot")
				.filter({ visible: true }),
		};
	}

	async open() {
		await this.locators.openButton.click();
	}

	async close() {
		await this.page.keyboard.press("Escape");
	}

	notification(text: string) {
		return this.locators.items.filter({ hasText: text });
	}

	async openNotification(text: string) {
		await this.notification(text).click();
	}

	/** Only offered once the popover's peek list is full. */
	async openAll() {
		await this.locators.seeAllLink.click();
		return new NotificationsPage(this.page);
	}
}
