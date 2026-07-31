import type { Page } from "@playwright/test";
import type { Tables } from "~/db/tables";
import { calendarReportWinnersPage } from "~/utils/urls";
import { navigate, selectUser, submit } from "../../helpers/playwright";

/** `/calendar/:id/report-winners` */
export class ReportWinnersPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			participantCountInput: page.getByLabel("Participant count"),
			teamNameInput: page.getByLabel("Team name"),
			placingInput: page.getByLabel("Placing"),
			emptyTeamError: page.getByText(
				"Each team must have at least one player.",
			),
			submitButton: page.getByTestId("submit-button"),
		};
	}

	async goto(eventId: Tables["CalendarEvent"]["id"]) {
		await navigate({
			page: this.page,
			url: calendarReportWinnersPage(eventId),
		});
	}

	player(number: number) {
		return this.page.getByLabel(`Player ${number}`);
	}

	async selectPlayer(number: number, userName: string) {
		await selectUser({
			page: this.page,
			userName,
			labelName: `Player ${number}`,
		});
	}

	/** Players without a sendou.ink account are reported as plain text instead. */
	async fillPlayerAsText(number: number, name: string) {
		await this.page
			.getByRole("button", { name: "Add as text" })
			.nth(number - 1)
			.click();
		await this.player(number).fill(name);
	}

	async submit() {
		await submit(this.page);
	}
}
