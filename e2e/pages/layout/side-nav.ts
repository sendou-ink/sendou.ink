import type { Page } from "@playwright/test";

type Section = "Events" | "Friends" | "Streams";

/** The sidebar of the site layout, a modal behind a hamburger on narrower viewports. */
export class SideNav {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			collapseButton: page.getByTestId("sidenav-collapse-button"),
			modalTrigger: page.getByTestId("sidenav-modal-trigger"),
			notificationsButton: page.getByTestId("notifications-button"),
			viewAllLinks: page.getByRole("link", { name: /View all/ }),
		};
	}

	sectionHeading(section: Section) {
		return this.page.getByRole("heading", { name: section });
	}

	async toggleCollapse() {
		await this.locators.collapseButton.click();
	}

	async openModal() {
		await this.locators.modalTrigger.click();
	}

	async closeModal() {
		await this.page.keyboard.press("Escape");
	}
}
