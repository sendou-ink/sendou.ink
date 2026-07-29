import type { Page } from "@playwright/test";
import { tournamentAdminPage } from "~/utils/urls";
import { navigate, submit } from "../../helpers/playwright";

const DRAG_TARGET_Y = 500;

export class TournamentSeedsPage {
	private readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	async goto(tournamentId: number) {
		await navigate({
			page: this.page,
			url: `${tournamentAdminPage(tournamentId)}/seeds`,
		});
	}

	teamHandle(tournamentTeamId: number) {
		return this.page.getByTestId(`seed-team-${tournamentTeamId}-handle`);
	}

	/** Drags a team down the seeding list, past the teams seeded below it. */
	async dragTeamDown(tournamentTeamId: number) {
		await this.teamHandle(tournamentTeamId).hover();
		await this.page.mouse.down();
		// i think the drag & drop library might actually be a bit buggy
		// so we have to do it in steps like this to allow for testing
		await this.page.mouse.move(0, DRAG_TARGET_Y, { steps: 10 });
		await this.page.mouse.up();
	}

	save() {
		return submit(this.page);
	}
}
