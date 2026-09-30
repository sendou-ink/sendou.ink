import type { Page } from "@playwright/test";
import { joinQueueFormSchema } from "~/features/tournament-lfg/tournament-lfg-schemas";
import { tournamentSubsPage } from "~/utils/urls";
import { navigate, waitForPOSTResponse } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

/** `/to/:id/looking` — the groups view shown while registration is still open. */
export class TournamentLookingPage {
	private readonly page: Page;
	private readonly stayAsSubSwitchLabel;
	readonly joinQueueForm;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.joinQueueForm = createFormHelpers(page, joinQueueFormSchema);
		this.stayAsSubSwitchLabel = page.getByTestId("stay-as-sub-switch");
		this.locators = {
			stayAsSubSwitch: this.stayAsSubSwitchLabel.getByRole("switch"),
		};
	}

	goto(tournamentId: number) {
		return navigate({ page: this.page, url: tournamentSubsPage(tournamentId) });
	}

	toggleStayAsSub() {
		return waitForPOSTResponse(this.page, () =>
			// the switch input itself is visually hidden behind its indicator
			this.stayAsSubSwitchLabel.click(),
		);
	}
}
