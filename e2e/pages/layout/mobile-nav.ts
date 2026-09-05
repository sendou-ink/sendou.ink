import type { Locator, Page } from "@playwright/test";
import { FriendRow } from "./side-nav";

type Panel = "menu" | "friends" | "tourneys" | "chat" | "you";

const TAB_NAMES: Record<Panel, string> = {
	menu: "Menu",
	friends: "Friends",
	tourneys: "Events",
	chat: "Chat",
	you: "You",
};

/**
 * The bottom tab bar and its panels, rendered in place of the side nav on mobile.
 *
 * The panels show the same rows as the side nav does, and its accessors find them
 * the same way — scoped to the panel that is open. Every panel is in the DOM,
 * closed, so a closed one is hidden rather than gone.
 */
export class MobileNav {
	private readonly page: Page;
	private readonly openPanelDialog: Locator;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.openPanelDialog = page.locator("[class*='panelDialog']:visible");
		this.locators = {
			menuPanel: page.getByRole("dialog", { name: "Menu", exact: true }),
			streamsHeading: page.locator("h3").filter({ hasText: "Streams" }),
			viewAllLink: page.getByRole("link", { name: "View all", exact: true }),
			youPanelUsername: page.locator("[class*='youPanelUsername']"),
			youPanelSettingsLink: this.openPanelDialog.getByRole("link", {
				name: "Settings",
			}),
			youPanelTeamLink: this.openPanelDialog.getByRole("link", {
				name: "My team",
			}),
			friendItems: this.openPanelDialog.locator("button[class*='listButton']"),
		};
	}

	tab(panel: Panel) {
		return this.page.getByRole("button", { name: TAB_NAMES[panel] });
	}

	/** The count a tab is badged with, e.g. the chat's unread messages. */
	tabBadge(panel: Panel) {
		return this.tab(panel).locator("[class*='tabBadge']");
	}

	async openPanel(panel: Panel) {
		await this.tab(panel).click();
	}

	/** Switches to another panel while one is open; the tab bar stays usable under the panels. */
	async switchPanel(panel: Panel) {
		await this.tab(panel).click();
	}

	async closePanel() {
		// with scripts off Playwright never sees a still sliding-in panel settle,
		// so its animation is waited out first
		await this.page.evaluate(() =>
			Promise.all(
				document.getAnimations().map((animation) => animation.finished),
			),
		);
		await this.openPanelDialog
			.locator("button[class*='panelCloseButton']")
			.click();
	}

	menuLink(name: string) {
		return this.locators.menuPanel.getByRole("link", { name });
	}

	friend(name: string) {
		return new FriendRow(this.page, this.openPanelDialog, name);
	}

	eventItem(name: string) {
		return this.openPanelDialog.getByRole("link", { name });
	}

	streamItem(name: string) {
		return this.eventItem(name);
	}
}
