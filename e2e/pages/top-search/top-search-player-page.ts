import type { Page } from "@playwright/test";
import { topSearchPlayerPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { PlacementsTable } from "./placements-table";
import { TopSearchPage } from "./top-search-page";

/** `/xsearch/player/:id` */
export class TopSearchPlayerPage {
	private readonly page: Page;
	readonly placements;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.placements = new PlacementsTable(page);
		this.locators = {
			// "<player name> placements", the one heading the layout doesn't also carry
			heading: this.page.getByRole("heading", { name: /placements$/ }),
		};
	}

	async goto(playerId: number) {
		await navigate({ page: this.page, url: topSearchPlayerPage(playerId) });
	}

	/** A row of this page leads to the whole leaderboard the placement was part of. */
	async openLeaderboard(nth: number) {
		await this.placements.row(nth).click();
		return new TopSearchPage(this.page);
	}
}
