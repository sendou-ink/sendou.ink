import type { Page } from "@playwright/test";
import { calendarNewBaseSchema } from "~/features/calendar/calendar-new-schemas";
import { CALENDAR_NEW_PAGE, TOURNAMENT_NEW_PAGE } from "~/utils/urls";
import { navigate } from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

/** `/calendar/new`, also used for adding tournaments and editing existing events. */
export class CalendarNewEventPage {
	private readonly page: Page;
	readonly form;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, calendarNewBaseSchema);
		this.locators = {
			nameInput: page.getByLabel(/^Name *\*?$/),
			newTournamentHeading: page.getByText("New tournament"),
			noTournamentPermissionsAlert: page.getByText(
				"No permissions to add tournaments",
			),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: CALENDAR_NEW_PAGE });
	}

	async gotoNewTournament() {
		await navigate({ page: this.page, url: TOURNAMENT_NEW_PAGE });
	}
}
