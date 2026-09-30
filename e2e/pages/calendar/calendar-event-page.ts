import type { Page } from "@playwright/test";
import type { Tables } from "~/db/tables";
import { calendarEventPage } from "~/utils/urls";
import { modalClickConfirmButton, navigate } from "../../helpers/playwright";
import { CalendarNewEventPage } from "./calendar-new-event-page";

/** `/calendar/:id` */
export class CalendarEventPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			resultRows: page.getByRole("row"),
			editButton: page.getByRole("link", { name: "Edit" }),
			deleteButton: page.getByRole("button", { name: "Delete event" }),
		};
	}

	async goto(eventId: Tables["CalendarEvent"]["id"]) {
		await navigate({ page: this.page, url: calendarEventPage(eventId) });
	}

	resultRow(teamName: string) {
		return this.locators.resultRows.filter({ hasText: teamName });
	}

	/** Matched on the machine-readable ISO attribute, making it timezone-agnostic. */
	startTime(date: Date) {
		return this.page.locator(`time[datetime="${date.toISOString()}"]`);
	}

	async openEdit() {
		await this.locators.editButton.click();
		return new CalendarNewEventPage(this.page);
	}

	/** Lands on the calendar page. */
	async delete() {
		await this.locators.deleteButton.click();
		await modalClickConfirmButton(this.page);
	}
}
