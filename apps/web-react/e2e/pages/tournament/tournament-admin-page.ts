import type { Page } from "@playwright/test";
import { addSubForUserFormSchema } from "~/features/tournament-lfg/tournament-lfg-schemas";
import { tournamentAdminPage } from "~/utils/urls";
import {
	modalClickConfirmButton,
	navigate,
	submit,
	waitForPOSTResponse,
} from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";
import { CalendarNewEventPage } from "../calendar/calendar-new-event-page";
import { TournamentAdminStaffPage } from "./tournament-admin-staff-page";
import { TournamentAdminStreamPage } from "./tournament-admin-stream-page";
import { TournamentNav } from "./tournament-nav";

/** `/to/:id/admin` — the teams list and the admin sub-page tabs. */
export class TournamentAdminPage {
	private readonly page: Page;
	readonly nav;
	readonly addSubForm;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.nav = new TournamentNav(page);
		this.addSubForm = createFormHelpers(page, addSubForUserFormSchema);
		this.locators = {
			editEventInfoButton: page.getByTestId("edit-event-info-button"),
			searchInput: page.getByLabel("Search teams"),
			teamRows: page.getByTestId("team-row"),
			teamNames: page.getByTestId("team-name"),
			noSearchResultsText: page.getByText("No registrations match your search"),
			exportButton: page.getByRole("button", { name: "Export" }),
			addSubButton: page.getByRole("button", { name: "Add sub" }),
			addSubDialogHeading: page.getByRole("heading", {
				name: "Add sub post on behalf of a user",
			}),
			exportDialogHeading: page.getByRole("heading", {
				name: "Export participants",
			}),
			downloadButton: page.getByRole("button", { name: "Download" }),
			unregisterDialogHeading: page.getByRole("heading", {
				name: /Unregister .* and delete its registration info\?/,
			}),
			bracketNameInputs: page.getByLabel(/^Bracket name *\*?$/),
			removeBracketButtons: page.getByTestId("brackets-remove-item-button"),
		};
	}

	async goto(tournamentId: number) {
		await navigate({ page: this.page, url: tournamentAdminPage(tournamentId) });
	}

	async editEventInfo() {
		await this.locators.editEventInfoButton.click();
		return new CalendarNewEventPage(this.page);
	}

	adminTab(name: string) {
		return this.page.getByRole("tab", { name });
	}

	async openStaff() {
		await this.adminTab("Staff").click();
		return new TournamentAdminStaffPage(this.page);
	}

	async openStream() {
		await this.adminTab("Stream").click();
		return new TournamentAdminStreamPage(this.page);
	}

	teamName(name: string) {
		return this.locators.teamNames.filter({ hasText: name });
	}

	async searchTeams(query: string) {
		await this.locators.searchInput.fill(query);
	}

	private teamRowActions(nth: number) {
		return this.locators.teamRows.nth(nth).getByLabel("Actions");
	}

	async checkTeamIn(nth: number) {
		await this.teamRowActions(nth).click();
		await waitForPOSTResponse(this.page, async () => {
			await this.page.getByRole("menuitem", { name: /^Check in/ }).click();
		});
	}

	async dropOutTeam(nth: number) {
		await this.teamRowActions(nth).click();
		await this.page.getByRole("menuitem", { name: "Drop out" }).click();
		await modalClickConfirmButton(this.page);
	}

	/** Checks a team in to a bracket that requires its own check-in, matched by its
	 * stable team id rather than the row index which shifts after the start. */
	async checkTeamInToBracket(tournamentTeamId: number, bracketName: string) {
		await this.page
			.locator(`[data-testid="team-row"][data-team-id="${tournamentTeamId}"]`)
			.getByLabel("Actions")
			.click();
		await waitForPOSTResponse(this.page, async () => {
			await this.page
				.getByRole("menuitem", { name: `Check in (${bracketName})` })
				.click();
		});
	}

	/** Opens the Brackets tab, where started brackets are locked and the rest of the progression is editable. */
	async openBrackets() {
		await this.adminTab("Brackets").click();
	}

	async renameBracket(nth: number, name: string) {
		await this.locators.bracketNameInputs.nth(nth).fill(name);
	}

	async saveProgression() {
		await submit(this.page);
	}

	/** Resets a bracket from the admin Brackets tab, typing out its name to confirm. */
	async resetBracket(bracketName: string) {
		await this.adminTab("Brackets").click();
		await this.page
			.getByLabel(`Type bracket name ("${bracketName}") to confirm`)
			.fill(bracketName);
		await submit(this.page, "reset-bracket-button");
	}

	async checkTeamOut(nth: number) {
		await this.teamRowActions(nth).click();
		await waitForPOSTResponse(this.page, async () => {
			await this.page.getByRole("menuitem", { name: /^Check out/ }).click();
		});
	}

	async unregisterTeam(nth: number) {
		await this.teamRowActions(nth).click();
		await this.page.getByRole("menuitem", { name: "Unregister" }).click();
	}

	confirmUnregister() {
		return modalClickConfirmButton(this.page);
	}

	async openExportDialog() {
		await this.locators.exportButton.click();
	}

	async openAddSubDialog() {
		await this.locators.addSubButton.click();
	}

	async downloadExport() {
		const downloadPromise = this.page.waitForEvent("download");
		await this.locators.downloadButton.click();
		return downloadPromise;
	}
}
