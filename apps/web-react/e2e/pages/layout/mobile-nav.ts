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
 * The bottom tab bar and its panels, rendered in place of the side nav on mobile.
 *
 * The panels show the same rows as the side nav does, and its accessors find them
 * the same way — scoped to the panel that is open.
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
			friendItems: this.openPanelDialog.locator("button[class*='listButton']"),
		};
	}

	tab(panel: Panel) {
		return this.page.getByRole("button", { name: TAB_NAMES[panel] });
	}

	async openPanel(panel: Panel) {
		await this.tab(panel).click();
	}

	/**
	 * Switches between panels the way the tab bar does while a panel is open. Its
	 * tabs are then covered by invisible overlays, which only a dispatched event reaches.
	 */
	async switchPanel(panel: Panel) {
		await this.page
			.locator("[class*='ghostTab']:not([class*='ghostTabBar'])")
			.nth(PANELS.indexOf(panel))
			.dispatchEvent("click");
	}

	async closePanel() {
		await this.page.locator("button:has(svg.lucide-x)").first().click();
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
