import type { Page } from "@playwright/test";
import { tournamentStationsDisplayPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

/** `/to/:id/stations/display` — the LAN station display screen. */
export class TournamentStationsDisplayPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			waiting: page.getByTestId("display-waiting"),
			lastUpdated: page.getByTestId("display-last-updated"),
			noStationsNotice: page.getByText("This tournament has no stations."),
		};
	}

	async goto(tournamentId: number) {
		await navigate({
			page: this.page,
			url: tournamentStationsDisplayPage(tournamentId),
		});
	}

	station(stationId: number) {
		return this.page.getByTestId(`display-station-${stationId}`);
	}

	now(stationId: number) {
		return this.page.getByTestId(`display-station-${stationId}-now`);
	}

	next(stationId: number) {
		return this.page.getByTestId(`display-station-${stationId}-next`);
	}
}
