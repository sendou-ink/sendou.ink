import type { Page } from "@playwright/test";
import type { Tables } from "~/db/tables";
import { calendarEventPage } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";

/** `/calendar/:id` */
export class CalendarEventPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			resultRows: page.getByRole("row"),
		};
	}

	async goto(eventId: Tables["CalendarEvent"]["id"]) {
		await navigate({ page: this.page, url: calendarEventPage(eventId) });
	}

	resultRow(teamName: string) {
		return this.locators.resultRows.filter({ hasText: teamName });
	}
}
