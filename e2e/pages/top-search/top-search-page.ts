import type { Page } from "@playwright/test";
import type { Tables } from "~/db/tables";
import { topSearchPage } from "~/features/top-search/top-search-urls";
import type { RankedModeShort } from "~/modules/in-game-lists/types";
import { navigate } from "../../helpers/playwright";
import { PlacementsTable } from "./placements-table";

type Leaderboard = Pick<
	Tables["XRankPlacement"],
	"month" | "year" | "region"
> & {
	mode: RankedModeShort;
};

const MODE_NAMES: Record<RankedModeShort, string> = {
	SZ: "Splat Zones",
	TC: "Tower Control",
	RM: "Rainmaker",
	CB: "Clam Blitz",
};

const DIVISION_NAMES: Record<Tables["XRankPlacement"]["region"], string> = {
	WEST: "Tentatek",
	JPN: "Takoroka",
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
			seasonMonthsSelect: this.page.getByTestId("xsearch-select"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: topSearchPage() });
	}

	async selectLeaderboard({ month, year, mode, region }: Leaderboard) {
		await this.locators.seasonMonthsSelect.click();
		// the trigger renders a copy of the selected option, so scope to the listbox
		await this.page
			.getByRole("listbox")
			.getByTestId(`xsearch-select-option-${month}-${year}`)
			.click();
		await this.page.getByText(MODE_NAMES[mode], { exact: true }).click();
		await this.page.getByText(DIVISION_NAMES[region], { exact: true }).click();
	}
}
