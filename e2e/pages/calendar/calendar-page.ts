import type { Page } from "@playwright/test";
import { calendarFiltersFormSchema } from "~/features/calendar/calendar-schemas";
import { calendarPage } from "~/utils/urls";
import {
	expectIsHydrated,
	navigate,
	waitForPOSTResponse,
} from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";

/** `/calendar` */
export class CalendarPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			tournamentCards: page.getByTestId("tournament-card"),
			hiddenEventsButtons: page.getByTestId("hidden-events-button"),
			clockHeaderTimes: page.getByTestId("clock-header-time"),
			todayHeader: page.getByTestId("today-header"),
			filterEventsButton: page.getByTestId("filter-events-button"),
			navigateButtons: page.getByTestId("calendar-navigate-button"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: calendarPage() });
	}

	tournamentCard(name: string) {
		return this.locators.tournamentCards.filter({ hasText: name });
	}

	tentativeTierPill(tournamentName: string) {
		return this.tournamentCard(tournamentName).getByTestId("tentative-tier");
	}

	confirmedTierPill(tournamentName: string) {
		return this.tournamentCard(tournamentName).getByTestId("confirmed-tier");
	}

	async reload() {
		await this.page.reload();
		await expectIsHydrated(this.page);
	}

	async openFilters() {
		await this.locators.filterEventsButton.click();
		return new CalendarFiltersDialog(this.page);
	}

	/** Shows or hides the events the current filters hide, of the first time slot. */
	async toggleHiddenEvents() {
		await this.locators.hiddenEventsButtons.first().click();
	}

	async navigatePrevious() {
		await this.locators.navigateButtons.first().click();
	}

	async navigateNext() {
		await this.locators.navigateButtons.nth(1).click();
	}
}

class CalendarFiltersDialog {
	private readonly page: Page;
	readonly form;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, calendarFiltersFormSchema);
		this.locators = {
			applyAndMakeDefaultButton: page.getByRole("button", {
				name: "Apply & make default",
			}),
		};
	}

	/** Applies the filters for this visit only, via search params. */
	async apply() {
		await this.form.submit();
	}

	/** Applies the filters and saves them as the user's default. */
	async applyAndMakeDefault() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.applyAndMakeDefaultButton.click(),
		);
	}
}
