import type { Page } from "@playwright/test";

type Category = "Play" | "Tools" | "Community";

/** The category menus (Play, Tools, Community) of the site layout's header. */
export class TopNavMenus {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			// a closed menu renders the same links as an icon-only preview, so
			// anything asserted about an open menu has to be scoped to it
			openMenu: page.locator("[class*='menuContent']"),
		};
	}

	async open(category: Category) {
		await this.page.getByRole("button", { name: category }).click();
	}

	async close() {
		await this.page.keyboard.press("Escape");
	}

	link(name: string) {
		return this.locators.openMenu.getByRole("link", { name });
	}
}
