import type { Page } from "@playwright/test";
import { BANNED_MAPS } from "~/features/match-profile/banned-maps";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import { registerTeamFormSchema } from "~/features/tournament/tournament-register-schemas";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { tournamentRegisterPage } from "~/utils/urls";
import { navigate, submit } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";
import { TournamentNav } from "./tournament-nav";

/** Stage the counterpick picking starts from, leaving the lowest ids to tiebreakers. */
const FIRST_COUNTERPICK_STAGE_ID = 5;

export class TournamentRegisterPage {
	private readonly page: Page;
	readonly nav;
	readonly form;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.nav = new TournamentNav(page);
		this.form = createFormHelpers(page, registerTeamFormSchema, {
			submitTestId: "save-team-button",
		});
		this.locators = {
			fillRosterHeading: page.getByText("Fill roster"),
		};
	}

	async goto(tournamentId: number) {
		await navigate({
			page: this.page,
			url: tournamentRegisterPage(tournamentId),
		});
	}

	member(number: number) {
		return this.page.getByTestId(`member-num-${number}`);
	}

	stepCheckmark(number: number) {
		return this.page.getByTestId(`checkmark-icon-num-${number}`);
	}

	counterpickMap(mode: ModeShort, stageId: StageId) {
		return this.page.getByTestId(`map-pool-${mode}-${stageId}`);
	}

	addPlayer() {
		return submit(this.page, "add-player-button");
	}

	/** Picks the required amount of counterpick maps for every mode, skipping banned ones. */
	async pickCounterpickMaps() {
		let stageId = FIRST_COUNTERPICK_STAGE_ID;

		for (const mode of rankedModesShort) {
			for (let i = 0; i < TOURNAMENT.COUNTERPICK_MAPS_PER_MODE; i++) {
				while (BANNED_MAPS[mode].includes(stageId as StageId)) {
					stageId++;
				}

				await this.counterpickMap(mode, stageId as StageId).click();
				stageId++;
			}
		}
	}

	saveCounterpickMaps() {
		return submit(this.page, "save-map-list-button");
	}

	checkIn() {
		return submit(this.page, "check-in-button");
	}

	openBrackets() {
		return this.nav.openBrackets();
	}
}
