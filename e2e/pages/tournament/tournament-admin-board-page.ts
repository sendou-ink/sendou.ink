import type { Page } from "@playwright/test";
import { tournamentAdminPage } from "~/utils/urls";
import { navigate, waitForPOSTResponse } from "../../helpers/playwright";

/** `/to/:id/admin/board` — the LAN stations board. */
export class TournamentAdminBoardPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			moveButtons: page.getByLabel("Move to"),
			readOnlyNotice: page.getByText(
				"Only organizers and streamers can move matches.",
			),
		};
	}

	async goto(tournamentId: number) {
		await navigate({
			page: this.page,
			url: `${tournamentAdminPage(tournamentId)}/board`,
		});
	}

	/** `null` = the Waiting lane. */
	lane(stationId: number | null) {
		return this.page.getByTestId(
			`board-lane-${stationId === null ? "waiting" : `station-${stationId}`}`,
		);
	}

	match(matchId: number) {
		return this.page.getByTestId(`board-match-${matchId}`);
	}

	/** Moves the match through its "Move to" menu. `null` = the Waiting lane. */
	async moveMatch(matchId: number, stationId: number | null) {
		await this.page.getByTestId(`board-match-${matchId}-move`).click();
		await waitForPOSTResponse(this.page, async () => {
			await this.page
				.getByTestId(
					`board-move-to-${stationId === null ? "waiting" : `station-${stationId}`}`,
				)
				.click();
		});
	}

	/** Drags the match by its handle into the lane of the station. */
	async dragMatch(matchId: number, stationId: number) {
		const target = await this.lane(stationId).boundingBox();
		if (!target) throw new Error("Station lane not visible");

		await this.page.getByTestId(`board-match-${matchId}-handle`).hover();
		await this.page.mouse.down();
		await waitForPOSTResponse(this.page, async () => {
			// the drag & drop library only registers the drop when moved in steps
			await this.page.mouse.move(
				target.x + target.width / 2,
				target.y + target.height / 2,
				{ steps: 10 },
			);
			await this.page.mouse.up();
		});
	}
}
