import type { Page } from "@playwright/test";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { tournamentTeamPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

export class TournamentTeamPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			memberNames: page.getByTestId("team-member-name"),
		};
	}

	async goto(tournamentId: number, tournamentTeamId: number) {
		await navigate({
			page: this.page,
			url: tournamentTeamPage({ tournamentId, tournamentTeamId }),
		});
	}

	/** A map of the team's counterpick map pool, shown to organizers before the tournament starts. */
	mapPoolStage(mode: ModeShort, stageId: StageId) {
		return this.page.getByTestId(`team-map-pool-${mode}-${stageId}`);
	}
}
