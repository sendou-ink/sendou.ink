import type { Page } from "@playwright/test";
import type { Tables } from "~/db/tables";
import type { RankedModeShort } from "~/modules/in-game-lists/types";
import { topSearchPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { PlacementsTable } from "./placements-table";

type Leaderboard = Pick<
	Tables["XRankPlacement"],
	"month" | "year" | "region"
> & {
	mode: RankedModeShort;
};

/** `/xsearch` */
export class TopSearchPage {
	private readonly page: Page;
	readonly placements;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.placements = new PlacementsTable(page);
		this.locators = {
			leaderboardSelect: this.page.getByTestId("xsearch-select"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: topSearchPage() });
	}

	async selectLeaderboard({ month, year, mode, region }: Leaderboard) {
		await this.locators.leaderboardSelect.selectOption(
			`${month}-${year}-${mode}-${region}`,
		);
	}
}
