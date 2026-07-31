import type { Page } from "@playwright/test";

type Panel = "menu" | "friends" | "tourneys" | "chat" | "you";

const TAB_NAMES: Record<Panel, string> = {
	menu: "Menu",
	friends: "Friends",
	tourneys: "Events",
	chat: "Chat",
	you: "You",
};

const PANELS: Panel[] = ["menu", "friends", "tourneys", "chat", "you"];

/** The bottom tab bar and its panels, rendered in place of the side nav on mobile. */
export class MobileNav {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			menuPanel: page.getByLabel("Menu", { exact: true }),
			streamsHeading: page.locator("h3").filter({ hasText: "Streams" }),
			viewAllLink: page.getByRole("link", { name: "View all", exact: true }),
			youPanelUsername: page.locator("[class*='youPanelUsername']"),
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
}
