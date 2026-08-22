import { expect, type Page } from "@playwright/test";
import { adminRegistrationFormSchema } from "~/features/tournament-admin/tournament-admin-registration-schemas";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import {
	tournamentAdminRegistrationEditPage,
	tournamentAdminRegistrationPage,
} from "~/utils/urls";
import {
	counterpickMap,
	pickCounterpickMaps,
	pickedCounterpickMap,
} from "../../helpers/counterpick-map-pool";
import {
	navigate,
	selectTournament,
	selectUser,
	submit,
} from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

/** `/to/:id/admin/registration` (add new team) and `/to/:id/admin/registration/:tid` (edit). */
export class TournamentAdminRegistrationPage {
	private readonly page: Page;
	readonly form;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, adminRegistrationFormSchema);
		this.locators = {
			editHeading: page.getByRole("heading", { name: "Edit registration" }),
			addHeading: page.getByRole("heading", { name: "Add new team" }),
			teamNameInput: page.getByLabel("Team name"),
			importTeamButton: page.getByRole("button", { name: "Import team" }),
			importDialogHeading: page.getByRole("heading", { name: "Import team" }),
			invalidMapPoolError: page.getByText("Invalid map pool"),
		};
	}

	async gotoNew(tournamentId: number) {
		await navigate({
			page: this.page,
			url: tournamentAdminRegistrationPage(tournamentId),
		});
	}

	async gotoEdit(tournamentId: number, tournamentTeamId: number) {
		await navigate({
			page: this.page,
			url: tournamentAdminRegistrationEditPage(tournamentId, tournamentTeamId),
		});
	}

	/** Selects a user into the roster's placeholder member row. */
	async selectPlayer(userName: string) {
		await selectUser({ page: this.page, userName, labelName: "Player" });
	}

	/** Adds a new member row to an existing roster and selects a user into it. */
	async addMember(userName: string) {
		await this.page.getByRole("button", { name: "Add", exact: true }).click();
		await this.page.getByLabel("Player").last().click();
		await this.page.getByTestId("user-search-input").fill(userName);
		await expect(
			this.page.getByTestId("user-search-item").first(),
		).toBeVisible();
		await this.page.keyboard.press("Enter");
	}

	/** Names the roster member at `index` for tournaments. Only shown to organizers who may set it. */
	async setTournamentName(index: number, name: string) {
		await this.page.getByLabel("Tournament name").nth(index).fill(name);
	}

	async selectCaptain(userId: number) {
		await this.page
			.getByLabel("Captain", { exact: true })
			.selectOption(String(userId));
	}

	save() {
		return submit(this.page);
	}

	/** Picks the required amount of counterpick maps for every mode, skipping banned ones. */
	pickCounterpickMaps() {
		return pickCounterpickMaps(this.page);
	}

	pickCounterpickMap(mode: ModeShort, stageId: StageId) {
		return counterpickMap(this.page, mode, stageId).click();
	}

	unpickCounterpickMap(mode: ModeShort, stageId: StageId) {
		return pickedCounterpickMap(this.page, mode, stageId).click();
	}

	pickedCounterpickMap(mode: ModeShort, stageId: StageId) {
		return pickedCounterpickMap(this.page, mode, stageId);
	}

	async openImportDialog() {
		await this.locators.importTeamButton.click();
	}

	/** The roster member select showing the given user, once their name has resolved. */
	memberWithName(name: string) {
		return this.page
			.getByRole("button", { name: "User search" })
			.filter({ hasText: name });
	}

	/** Picks the source tournament; its team `<select>` populates asynchronously
	 * from the import loader and auto-selects the first team. */
	async importFirstTeamFrom(tournamentQuery: string) {
		const dialog = this.page.getByRole("dialog");

		await selectTournament({ page: this.page, query: tournamentQuery });

		const teamSelect = dialog.getByLabel("Team", { exact: true });
		await expect(teamSelect.locator("option")).not.toHaveCount(0);

		await dialog.getByTestId("submit-button").click();
	}
}
