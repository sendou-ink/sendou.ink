import type { Page } from "@playwright/test";
import { registerTeamFormSchema } from "~/features/tournament/tournament-register-schemas";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { tournamentRegisterPage } from "~/utils/urls";
import {
	counterpickMap,
	pickCounterpickMaps,
} from "../../helpers/counterpick-map-pool";
import { navigate, submit } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";
import { TournamentNav } from "./tournament-nav";

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
			registrationClosedAlert: page.getByText(
				"Registration for this tournament has closed",
			),
			leaveTeamButton: page.getByRole("button", { name: "Leave the team" }),
			organizerAddedLeaveExplanation: page.getByText(
				"You were added to the team by the organizer. Contact the TO to leave the team.",
			),
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
		return counterpickMap(this.page, mode, stageId);
	}

	addPlayer() {
		return submit(this.page, "add-player-button");
	}

	/** Picks the required amount of counterpick maps for every mode, skipping banned ones. */
	pickCounterpickMaps() {
		return pickCounterpickMaps(this.page);
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
