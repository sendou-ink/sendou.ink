import type { Locator, Page } from "@playwright/test";
import { waitForPOSTResponse } from "../../helpers/playwright";

type Section = "Events" | "Friends" | "Streams";

/**
 * The sidebar of the site layout, a modal behind a hamburger on narrower viewports.
 *
 * Its rows are looked up inside the sidebar the viewport shows — the rail, or the
 * copy of it the modal renders — so that the same row appearing on the page behind
 * it (a tournament also shown as a front page card) is not mistaken for one.
 */
export class SideNav {
	private readonly page: Page;
	private readonly root: Locator;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.root = page.locator('[data-testid="side-nav"]:visible');
		this.locators = {
			collapseButton: page.getByTestId("sidenav-collapse-button"),
			modalTrigger: page.getByTestId("sidenav-modal-trigger"),
			unseenRequestsBadge: page.getByRole("status", {
				name: /unseen friend request/,
			}),
			upcomingDivider: this.root.getByTestId("upcoming-divider"),
			/** Every row of the sidebar's link lists, in render order: events, then streams. */
			listItems: this.root.getByTestId("list-link"),
			friendItems: this.root.getByTestId("list-button"),
		};
	}

	/** Where the unseen friend requests badge moves to while the sidebar is collapsed. */
	get collapsedRequestsBadge() {
		return this.locators.collapseButton.getByRole("status");
	}

	sectionHeading(section: Section) {
		return this.root.getByRole("heading", { name: section });
	}

	viewAllLink(section: "Events" | "Friends") {
		return this.root
			.getByTestId("side-nav-header")
			.filter({ has: this.page.getByRole("heading", { name: section }) })
			.getByRole("link", { name: /View all/ });
	}

	/** Text shown in place of a section's rows when it has none. */
	emptyText(text: string) {
		return this.page.locator('[data-testid="side-nav-empty"]:visible', {
			hasText: text,
		});
	}

	eventItem(name: string) {
		return this.root.getByRole("link", { name });
	}

	streamItem(name: string) {
		return this.eventItem(name);
	}

	itemSubtitle(name: string) {
		return this.eventItem(name).getByTestId("list-item-subtitle");
	}

	itemBadge(name: string) {
		return this.eventItem(name).getByTestId("list-item-badge");
	}

	/** The tier an upcoming tournament's stream row is pilled with. */
	itemTier(name: string) {
		return this.streamItem(name).getByTestId("confirmed-tier");
	}

	saveStreamButton(streamName: string) {
		return this.streamItem(streamName).getByTitle("Save");
	}

	savedStreamIcon(streamName: string) {
		return this.streamItem(streamName).getByTestId("stream-saved-icon");
	}

	async saveStream(streamName: string) {
		await waitForPOSTResponse(this.page, () =>
			this.saveStreamButton(streamName).click(),
		);
	}

	friend(name: string) {
		return new FriendRow(this.page, this.root, name);
	}

	async toggleCollapse() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.collapseButton.click(),
		);
	}

	async openModal() {
		await this.locators.modalTrigger.click();
	}

	async closeModal() {
		await this.page.keyboard.press("Escape");
	}
}

/** One friend of the friends list, and the menu opening from it. */
export class FriendRow {
	private readonly page: Page;
	readonly trigger: Locator;
	readonly locators;

	constructor(page: Page, root: Locator, name: string) {
		this.page = page;
		this.trigger = root.getByRole("button", { name });
		this.locators = {
			subtitle: this.trigger.getByTestId("list-item-subtitle"),
			badge: this.trigger.getByTestId("list-item-badge"),
		};
	}

	async openMenu() {
		await this.trigger.click();
	}

	/** Menu items render in a portal, so they are found on the page, not in the row. */
	menuItem(name: string) {
		return this.page.getByRole("menuitem", { name });
	}

	watchStreamHref() {
		return this.menuItem("Watch stream").getAttribute("href");
	}
}
