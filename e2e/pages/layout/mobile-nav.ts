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

const PANELS: Panel[] = ["menu", "friends", "tourneys", "chat", "you"];

/**
 * The bottom tab bar and its panels, rendered in place of the side nav on mobile. The panels
 * show the same rows as the side nav, found the same way but scoped to the open panel.
 */
export class MobileNav {
	private readonly page: Page;
	private readonly openPanelDialog: Locator;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.openPanelDialog = page.locator("[class*='panelDialog']:visible");
		this.locators = {
			menuPanel: page.getByLabel("Menu", { exact: true }),
			streamsHeading: page.locator("h3").filter({ hasText: "Streams" }),
			viewAllLink: page.getByRole("link", { name: "View all", exact: true }),
			youPanelUsername: page.locator("[class*='youPanelUsername']"),
			youPanelSettingsLink: this.openPanelDialog.getByRole("link", {
				name: "Settings",
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

	/** Switches panels while one is open: the tabs are then under invisible overlays only a dispatched event reaches. */
	async switchPanel(panel: Panel) {
		await this.page
			.locator("[class*='ghostTab']:not([class*='ghostTabBar'])")
			.nth(PANELS.indexOf(panel))
			.dispatchEvent("click");
	}

	async closePanel() {
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
