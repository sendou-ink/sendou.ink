import type { Page } from "@playwright/test";
import { LEADERBOARDS_PAGE } from "~/utils/urls";
import { expectRouterIdle, navigate } from "../../helpers/playwright";

/** `/leaderboards` */
export class LeaderboardsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			playersTab: this.page.getByRole("tab", { name: "Players" }),
			teamsTab: this.page.getByRole("tab", { name: "Teams" }),
			xpTab: this.page.getByRole("tab", { name: "X Battle" }),
			weaponSelect: this.page.getByTestId("weapon-select"),
			rows: this.page.locator("main a[href]").filter({
				has: this.page.locator("img"),
			}),
		};
	}

	async goto(search = "") {
		await navigate({
			page: this.page,
			url: `${LEADERBOARDS_PAGE}${search}`,
		});
	}

	async selectTab(tab: "playersTab" | "teamsTab" | "xpTab") {
		await this.locators[tab].click();
		await expectRouterIdle(this.page);
	}

	async selectModeChip(label: string) {
		await this.page
			.getByRole("radiogroup")
			.getByText(label, { exact: true })
			.click();
		await expectRouterIdle(this.page);
	}
}
