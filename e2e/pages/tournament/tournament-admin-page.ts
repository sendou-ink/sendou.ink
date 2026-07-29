import type { Page } from "@playwright/test";
import { tournamentAdminPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { CalendarNewEventPage } from "../calendar/calendar-new-event-page";

export class TournamentAdminPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			editEventInfoButton: page.getByTestId("edit-event-info-button"),
		};
	}

	async goto(tournamentId: number) {
		await navigate({ page: this.page, url: tournamentAdminPage(tournamentId) });
	}

	async editEventInfo() {
		await this.locators.editEventInfoButton.click();
		return new CalendarNewEventPage(this.page);
	}
}
