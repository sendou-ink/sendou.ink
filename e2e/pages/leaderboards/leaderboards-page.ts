import type { Page } from "@playwright/test";
import { leaderboardsPage } from "~/features/leaderboards/leaderboards-urls";
import { navigate, selectWeapon } from "../../helpers/playwright";

export class LeaderboardsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			noPlayersText: page.getByText("No players on the leaderboard yet"),
			noTeamsText: page.getByText("No teams on the leaderboard yet"),
			updateInfoText: page.getByText(
				"Leaderboard is updated once every 30 minutes",
			),
			seasonSelect: page.getByRole("button", { name: /^Season \d+ Season$/ }),
		};
	}

	async goto(args: { season?: number; type?: "USER" | "TEAM" } = {}) {
		await navigate({ page: this.page, url: leaderboardsPage(args) });
	}

	tab(name: "Players" | "Teams" | "X Battle") {
		return this.page.getByRole("tab", { name });
	}

	/** Clickable label of a filter chip, e.g. a weapon category, team scope or mode. */
	filterChip(label: string) {
		return this.page.getByRole("radiogroup").getByText(label, { exact: true });
	}

	filterChipRadio(label: string) {
		return this.page.getByRole("radio", { name: label });
	}

	/** Name as rendered in a leaderboard entry: a player or X Battle placement row, or a team roster member. */
	entryName(name: string) {
		return this.page.getByText(name, { exact: true });
	}

	async selectSeason(season: number) {
		await this.locators.seasonSelect.click();
		await this.page
			.getByRole("option", { name: `Season ${season}`, exact: true })
			.click();
	}

	async selectXPWeapon(name: string) {
		await selectWeapon({ page: this.page, name });
	}
}
