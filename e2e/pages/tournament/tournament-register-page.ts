import type { Page } from "@playwright/test";
import { registerTeamFormSchema } from "~/features/tournament/tournament-register-schemas";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { tournamentRegisterPage } from "~/utils/urls";
import {
	counterpickMap,
	pickCounterpickMaps,
} from "../../helpers/counterpick-map-pool";
import {
	modalClickConfirmButton,
	navigate,
	submit,
} from "../../helpers/playwright";
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
			deleteMemberButton: page.getByRole("button", { name: "Delete member" }),
			unregisterButton: page.getByRole("button", { name: "Unregister" }),
			organizerAddedLeaveExplanation: page.getByText(
				"You were added to the team by the organizer. Contact the TO to leave the team.",
			),
			addPlayerButton: page.getByTestId("add-player-button"),
			copyInviteLinkButton: page.getByRole("button", {
				name: "Copy to clipboard",
			}),
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

	availabilityRow(userId: number) {
		return this.page.getByTestId(`availability-row-${userId}`);
	}

	/** Opens the quick add dropdown so its player rows render. */
	async openQuickAdd() {
		await this.page.getByTestId("quick-add-select").getByRole("button").click();
	}

	/** The roster footer of a format too small to have subs, e.g. "2v2". */
	noSubsFooter(format: string) {
		return this.page.getByText(`Format is ${format}. No subs allowed.`);
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

	/** Adds every player-role member of the sendou.ink team via the quick add all button, confirming the dialog. */
	async addAllTeamPlayers(teamId: number) {
		await this.page.getByTestId(`add-team-players-button-${teamId}`).click();
		await modalClickConfirmButton(this.page);
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
